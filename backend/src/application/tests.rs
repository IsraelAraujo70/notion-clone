use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::{DateTime, TimeZone, Utc};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::auth::change_password::{ChangePasswordInput, ChangePasswordUseCase};
use crate::application::auth::get_current_user::GetCurrentUserUseCase;
use crate::application::auth::login::{LoginInput, LoginUseCase};
use crate::application::auth::logout::LogoutUseCase;
use crate::application::auth::request_password_reset::{
    PASSWORD_RESET_TTL_MINUTES, RequestPasswordResetInput, RequestPasswordResetUseCase,
};
use crate::application::auth::reset_password::{ResetPasswordInput, ResetPasswordUseCase};
use crate::application::auth::signup::{SignupInput, SignupUseCase};
use crate::application::pages::{
    ApplyOperationUseCase, GetPageUseCase, ListOperationsUseCase, ListPagesUseCase,
    ListTrashUseCase, PermanentlyDeleteUseCase, PublicLinksUseCase, SearchPagesUseCase,
    TransferSubtreeUseCase,
};
use crate::application::ports::auth::{
    AuthRepository, CreateUserRecord, CreateUserWithDefaultWorkspaceRecord,
};
use crate::application::ports::clock::Clock;
use crate::application::ports::email::{EmailSender, PasswordResetEmail, WorkspaceInviteEmail};
use crate::application::ports::page::{
    AppliedOperation, LoggedOperation, OperationAck, PageList, PageRepository, PageTree, PageView,
    PermanentDeleteResult, PublicLink, SearchResult, TransferSubtreeResult, TrashEntry,
};
use crate::application::ports::workspace::{CreateWorkspaceInviteRecord, WorkspaceRepository};
use crate::application::ports::{EmailError, RepositoryError};
use crate::application::realtime::RealtimeHub;
use crate::application::workspaces::accept_invite::{AcceptInviteInput, AcceptInviteUseCase};
use crate::application::workspaces::create_workspace::{
    CreateWorkspaceInput, CreateWorkspaceUseCase,
};
use crate::application::workspaces::delete_workspace::DeleteWorkspaceUseCase;
use crate::application::workspaces::invite_member::{
    InviteMemberInput, InviteMemberUseCase, WORKSPACE_INVITE_TTL_DAYS,
};
use crate::application::workspaces::remove_member::RemoveMemberUseCase;
use crate::application::workspaces::update_member_role::UpdateMemberRoleUseCase;
use crate::domain::auth::{User, UserWithPassword, hash_password, hash_token, verify_password};
use crate::domain::block::Operation;
use crate::domain::workspace::{
    Workspace, WorkspaceInvite, WorkspaceInvitePreview, WorkspaceInviteStatus, WorkspaceMember,
    WorkspaceMembership, WorkspaceRole,
};

#[derive(Clone)]
struct FixedClock {
    now: DateTime<Utc>,
}

impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        self.now
    }
}

fn fixed_now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 7, 7, 12, 0, 0).unwrap()
}

fn user(id: Uuid, email: &str) -> User {
    User {
        id,
        email: email.to_string(),
        display_name: "Israel".to_string(),
        avatar_key: None,
        avatar_url: None,
        created_at: fixed_now(),
    }
}

type ResetTokenRecord = (Uuid, DateTime<Utc>, bool);

#[derive(Default)]
struct FakeAuthRepository {
    users: Mutex<HashMap<Uuid, UserWithPassword>>,
    sessions: Mutex<HashMap<String, (Uuid, DateTime<Utc>)>>,
    reset_tokens: Mutex<HashMap<String, ResetTokenRecord>>,
    default_workspaces: Mutex<HashMap<Uuid, Workspace>>,
}

#[async_trait]
impl AuthRepository for FakeAuthRepository {
    async fn create_user(&self, input: CreateUserRecord) -> Result<User, RepositoryError> {
        let mut users = self.users.lock().unwrap();
        if users
            .values()
            .any(|record| record.user.email == input.email)
        {
            return Err(RepositoryError::DuplicateEmail);
        }
        let user = User {
            id: Uuid::new_v4(),
            email: input.email,
            display_name: input.display_name,
            avatar_key: None,
            avatar_url: None,
            created_at: fixed_now(),
        };
        users.insert(
            user.id,
            UserWithPassword {
                user: user.clone(),
                password_hash: input.password_hash,
            },
        );
        Ok(user)
    }

    async fn create_user_with_default_workspace(
        &self,
        input: CreateUserWithDefaultWorkspaceRecord,
    ) -> Result<(User, Workspace), RepositoryError> {
        let user = self
            .create_user(CreateUserRecord {
                email: input.email,
                password_hash: input.password_hash,
                display_name: input.display_name,
            })
            .await?;
        let workspace = Workspace {
            id: Uuid::new_v4(),
            name: input.workspace_name,
            created_at: fixed_now(),
        };
        self.default_workspaces
            .lock()
            .unwrap()
            .insert(user.id, workspace.clone());
        Ok((user, workspace))
    }

    async fn find_user_with_password_by_email(
        &self,
        email: &str,
    ) -> Result<Option<UserWithPassword>, RepositoryError> {
        Ok(self
            .users
            .lock()
            .unwrap()
            .values()
            .find(|record| record.user.email == email)
            .cloned())
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<User>, RepositoryError> {
        Ok(self
            .users
            .lock()
            .unwrap()
            .values()
            .find(|record| record.user.email == email)
            .map(|record| record.user.clone()))
    }

    async fn create_session(
        &self,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        self.sessions
            .lock()
            .unwrap()
            .insert(token_hash.to_string(), (user_id, expires_at));
        Ok(())
    }

    async fn find_user_by_session_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<User>, RepositoryError> {
        let Some((user_id, expires_at)) = self.sessions.lock().unwrap().get(token_hash).copied()
        else {
            return Ok(None);
        };
        if expires_at <= now {
            return Ok(None);
        }
        Ok(self
            .users
            .lock()
            .unwrap()
            .get(&user_id)
            .map(|record| record.user.clone()))
    }

    async fn delete_session(&self, token_hash: &str) -> Result<(), RepositoryError> {
        self.sessions.lock().unwrap().remove(token_hash);
        Ok(())
    }

    async fn create_password_reset_token(
        &self,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        let mut tokens = self.reset_tokens.lock().unwrap();
        for (_, (token_user_id, _, used)) in tokens.iter_mut() {
            if *token_user_id == user_id {
                *used = true;
            }
        }
        tokens.insert(token_hash.to_string(), (user_id, expires_at, false));
        Ok(())
    }

    async fn reset_password_with_token(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
        password_hash: &str,
    ) -> Result<bool, RepositoryError> {
        let user_id = {
            let mut tokens = self.reset_tokens.lock().unwrap();
            let Some((user_id, expires_at, used)) = tokens.get_mut(token_hash) else {
                return Ok(false);
            };
            if *used || *expires_at <= now {
                return Ok(false);
            }
            *used = true;
            *user_id
        };

        if let Some(record) = self.users.lock().unwrap().get_mut(&user_id) {
            record.password_hash = password_hash.to_string();
        }
        self.sessions
            .lock()
            .unwrap()
            .retain(|_, (session_user_id, _)| *session_user_id != user_id);
        Ok(true)
    }

    async fn update_password_and_delete_other_sessions(
        &self,
        user_id: Uuid,
        password_hash: &str,
        current_token_hash: &str,
    ) -> Result<(), RepositoryError> {
        if let Some(record) = self.users.lock().unwrap().get_mut(&user_id) {
            record.password_hash = password_hash.to_string();
        }
        self.sessions
            .lock()
            .unwrap()
            .retain(|token_hash, (session_user_id, _)| {
                *session_user_id != user_id || token_hash == current_token_hash
            });
        Ok(())
    }

    async fn update_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_key: Option<Option<String>>,
    ) -> Result<User, RepositoryError> {
        let mut users = self.users.lock().unwrap();
        let record = users.get_mut(&user_id).ok_or(RepositoryError::NotFound)?;
        if let Some(name) = display_name {
            record.user.display_name = name;
        }
        if let Some(key) = avatar_key {
            record.user.avatar_key = key;
        }
        Ok(record.user.clone())
    }

    async fn find_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, RepositoryError> {
        Ok(self
            .users
            .lock()
            .unwrap()
            .get(&user_id)
            .map(|record| record.user.clone()))
    }
}

#[derive(Default)]
struct FakeWorkspaceRepository {
    workspaces: Mutex<Vec<(Uuid, WorkspaceMembership)>>,
    members: Mutex<Vec<(Uuid, WorkspaceMember)>>,
    invites: Mutex<Vec<WorkspaceInvite>>,
    invite_tokens: Mutex<HashMap<String, Uuid>>,
}

#[async_trait]
impl WorkspaceRepository for FakeWorkspaceRepository {
    async fn list_for_user(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<WorkspaceMembership>, RepositoryError> {
        Ok(self
            .workspaces
            .lock()
            .unwrap()
            .iter()
            .filter(|(member_user_id, _)| *member_user_id == user_id)
            .map(|(_, workspace)| workspace.clone())
            .collect())
    }

    async fn create_for_owner(
        &self,
        owner_id: Uuid,
        name: String,
    ) -> Result<Workspace, RepositoryError> {
        let workspace = Workspace {
            id: Uuid::new_v4(),
            name,
            created_at: fixed_now(),
        };
        self.workspaces.lock().unwrap().push((
            owner_id,
            WorkspaceMembership {
                id: workspace.id,
                name: workspace.name.clone(),
                role: WorkspaceRole::Owner,
                created_at: workspace.created_at,
            },
        ));
        self.members.lock().unwrap().push((
            workspace.id,
            WorkspaceMember {
                user_id: owner_id,
                email: "owner@example.com".to_string(),
                display_name: "Owner".to_string(),
                role: WorkspaceRole::Owner,
                joined_at: fixed_now(),
            },
        ));
        Ok(workspace)
    }

    async fn find_membership(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<WorkspaceMembership>, RepositoryError> {
        Ok(self
            .workspaces
            .lock()
            .unwrap()
            .iter()
            .find(|(member_user_id, membership)| {
                *member_user_id == user_id && membership.id == workspace_id
            })
            .map(|(_, membership)| membership.clone()))
    }

    async fn list_members(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<WorkspaceMember>, RepositoryError> {
        Ok(self
            .members
            .lock()
            .unwrap()
            .iter()
            .filter(|(member_workspace_id, _)| *member_workspace_id == workspace_id)
            .map(|(_, member)| member.clone())
            .collect())
    }

    async fn find_member_by_email(
        &self,
        workspace_id: Uuid,
        email: &str,
    ) -> Result<Option<WorkspaceMember>, RepositoryError> {
        Ok(self
            .members
            .lock()
            .unwrap()
            .iter()
            .find(|(member_workspace_id, member)| {
                *member_workspace_id == workspace_id && member.email == email
            })
            .map(|(_, member)| member.clone()))
    }

    async fn count_owners(&self, workspace_id: Uuid) -> Result<i64, RepositoryError> {
        Ok(self
            .workspaces
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, membership)| {
                membership.id == workspace_id && membership.role == WorkspaceRole::Owner
            })
            .count() as i64)
    }

    async fn list_pending_invites(
        &self,
        workspace_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<Vec<WorkspaceInvite>, RepositoryError> {
        Ok(self
            .invites
            .lock()
            .unwrap()
            .iter()
            .filter(|invite| {
                invite.workspace_id == workspace_id
                    && invite.accepted_at.is_none()
                    && invite.revoked_at.is_none()
                    && invite.expires_at > now
            })
            .cloned()
            .collect())
    }

    async fn revoke_open_invite(
        &self,
        workspace_id: Uuid,
        email: &str,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        for invite in self.invites.lock().unwrap().iter_mut() {
            if invite.workspace_id == workspace_id
                && invite.email == email
                && invite.accepted_at.is_none()
                && invite.revoked_at.is_none()
            {
                invite.revoked_at = Some(revoked_at);
            }
        }
        Ok(())
    }

    async fn revoke_invite(
        &self,
        workspace_id: Uuid,
        invite_id: Uuid,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        for invite in self.invites.lock().unwrap().iter_mut() {
            if invite.workspace_id == workspace_id && invite.id == invite_id {
                invite.revoked_at = Some(revoked_at);
            }
        }
        Ok(())
    }

    async fn create_invite(
        &self,
        input: CreateWorkspaceInviteRecord,
    ) -> Result<WorkspaceInvite, RepositoryError> {
        let invite = WorkspaceInvite {
            id: Uuid::new_v4(),
            workspace_id: input.workspace_id,
            email: input.email,
            role: input.role,
            invited_by: input.invited_by,
            created_at: fixed_now(),
            expires_at: input.expires_at,
            accepted_at: None,
            revoked_at: None,
        };
        self.invite_tokens
            .lock()
            .unwrap()
            .insert(input.token_hash, invite.id);
        self.invites.lock().unwrap().push(invite.clone());
        Ok(invite)
    }

    async fn find_invite_preview_by_token_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<WorkspaceInvitePreview>, RepositoryError> {
        let Some(invite_id) = self.invite_tokens.lock().unwrap().get(token_hash).copied() else {
            return Ok(None);
        };
        let Some(invite) = self
            .invites
            .lock()
            .unwrap()
            .iter()
            .find(|invite| invite.id == invite_id)
            .cloned()
        else {
            return Ok(None);
        };
        let workspace_name = self
            .workspaces
            .lock()
            .unwrap()
            .iter()
            .find(|(_, membership)| membership.id == invite.workspace_id)
            .map(|(_, membership)| membership.name.clone())
            .unwrap_or_else(|| "Workspace".to_string());
        let status = if invite.accepted_at.is_some() {
            WorkspaceInviteStatus::Accepted
        } else if invite.revoked_at.is_some() {
            WorkspaceInviteStatus::Revoked
        } else if invite.expires_at <= now {
            WorkspaceInviteStatus::Expired
        } else {
            WorkspaceInviteStatus::Pending
        };
        Ok(Some(WorkspaceInvitePreview {
            workspace_name,
            email: invite.email,
            role: invite.role,
            expires_at: invite.expires_at,
            status,
        }))
    }

    async fn find_invite_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<WorkspaceInvite>, RepositoryError> {
        let Some(invite_id) = self.invite_tokens.lock().unwrap().get(token_hash).copied() else {
            return Ok(None);
        };
        Ok(self
            .invites
            .lock()
            .unwrap()
            .iter()
            .find(|invite| invite.id == invite_id)
            .cloned())
    }

    async fn accept_invite(
        &self,
        invite_id: Uuid,
        user_id: Uuid,
        accepted_at: DateTime<Utc>,
    ) -> Result<WorkspaceMembership, RepositoryError> {
        let mut invites = self.invites.lock().unwrap();
        let invite = invites
            .iter_mut()
            .find(|invite| invite.id == invite_id)
            .ok_or(RepositoryError::NotFound)?;
        invite.accepted_at = Some(accepted_at);
        let workspace_name = self
            .workspaces
            .lock()
            .unwrap()
            .iter()
            .find(|(_, membership)| membership.id == invite.workspace_id)
            .map(|(_, membership)| membership.name.clone())
            .unwrap_or_else(|| "Workspace".to_string());
        let membership = WorkspaceMembership {
            id: invite.workspace_id,
            name: workspace_name,
            role: invite.role,
            created_at: fixed_now(),
        };
        self.workspaces
            .lock()
            .unwrap()
            .push((user_id, membership.clone()));
        self.members.lock().unwrap().push((
            invite.workspace_id,
            WorkspaceMember {
                user_id,
                email: invite.email.clone(),
                display_name: "Invited".to_string(),
                role: invite.role,
                joined_at: accepted_at,
            },
        ));
        Ok(membership)
    }

    async fn update_member_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: WorkspaceRole,
    ) -> Result<(), RepositoryError> {
        for (member_user_id, membership) in self.workspaces.lock().unwrap().iter_mut() {
            if *member_user_id == user_id && membership.id == workspace_id {
                membership.role = role;
            }
        }
        for (member_workspace_id, member) in self.members.lock().unwrap().iter_mut() {
            if *member_workspace_id == workspace_id && member.user_id == user_id {
                member.role = role;
            }
        }
        Ok(())
    }

    async fn remove_member(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), RepositoryError> {
        self.workspaces
            .lock()
            .unwrap()
            .retain(|(member_user_id, membership)| {
                !(*member_user_id == user_id && membership.id == workspace_id)
            });
        self.members
            .lock()
            .unwrap()
            .retain(|(member_workspace_id, member)| {
                !(*member_workspace_id == workspace_id && member.user_id == user_id)
            });
        Ok(())
    }

    async fn delete_workspace(&self, workspace_id: Uuid) -> Result<(), RepositoryError> {
        self.workspaces
            .lock()
            .unwrap()
            .retain(|(_, membership)| membership.id != workspace_id);
        self.members
            .lock()
            .unwrap()
            .retain(|(member_workspace_id, _)| *member_workspace_id != workspace_id);
        self.invites
            .lock()
            .unwrap()
            .retain(|invite| invite.workspace_id != workspace_id);
        Ok(())
    }
}

#[derive(Default)]
struct FakeEmailSender {
    sent: Mutex<Vec<PasswordResetEmail>>,
    invite_sent: Mutex<Vec<WorkspaceInviteEmail>>,
}

#[async_trait]
impl EmailSender for FakeEmailSender {
    async fn send_password_reset(&self, email: PasswordResetEmail) -> Result<(), EmailError> {
        self.sent.lock().unwrap().push(email);
        Ok(())
    }

    async fn send_workspace_invite(&self, email: WorkspaceInviteEmail) -> Result<(), EmailError> {
        self.invite_sent.lock().unwrap().push(email);
        Ok(())
    }
}

fn clock() -> Arc<dyn Clock> {
    Arc::new(FixedClock { now: fixed_now() })
}

#[tokio::test]
async fn signup_creates_user_and_session() {
    let repo = Arc::new(FakeAuthRepository::default());
    let use_case = SignupUseCase::new(repo.clone(), clock());

    let response = use_case
        .execute(SignupInput {
            email: " ISRAEL@EXAMPLE.COM ".to_string(),
            password: "Password123!".to_string(),
            display_name: " Israel ".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(response.user.email, "israel@example.com");
    assert_eq!(response.user.display_name, "Israel");
    assert!(
        repo.sessions
            .lock()
            .unwrap()
            .contains_key(&hash_token(&response.token))
    );
    assert_eq!(
        repo.default_workspaces
            .lock()
            .unwrap()
            .get(&response.user.id)
            .unwrap()
            .name,
        "Pessoal"
    );
}

#[tokio::test]
async fn create_workspace_validates_name_and_creates_owner_workspace() {
    let repo = Arc::new(FakeWorkspaceRepository::default());
    let use_case = CreateWorkspaceUseCase::new(repo.clone());
    let owner_id = Uuid::new_v4();

    let workspace = use_case
        .execute(CreateWorkspaceInput {
            owner_id,
            name: " Product ".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(workspace.name, "Product");
    assert_eq!(
        repo.workspaces.lock().unwrap()[0].1.role,
        WorkspaceRole::Owner
    );

    let invalid = use_case
        .execute(CreateWorkspaceInput {
            owner_id,
            name: " ".to_string(),
        })
        .await
        .unwrap_err();
    assert!(matches!(invalid, AppError::Domain(_)));
}

#[tokio::test]
async fn duplicate_signup_returns_duplicate_email() {
    let repo = Arc::new(FakeAuthRepository::default());
    let use_case = SignupUseCase::new(repo, clock());
    let input = SignupInput {
        email: "israel@example.com".to_string(),
        password: "Password123!".to_string(),
        display_name: "Israel".to_string(),
    };

    use_case.execute(input.clone()).await.unwrap();
    assert_eq!(
        use_case.execute(input).await.unwrap_err(),
        AppError::DuplicateEmail
    );
}

#[tokio::test]
async fn login_rejects_invalid_password_and_accepts_valid_password() {
    let repo = Arc::new(FakeAuthRepository::default());
    repo.users.lock().unwrap().insert(
        Uuid::new_v4(),
        UserWithPassword {
            user: user(Uuid::new_v4(), "israel@example.com"),
            password_hash: hash_password("Password123!").unwrap(),
        },
    );
    let use_case = LoginUseCase::new(repo.clone(), clock());

    let invalid = use_case
        .execute(LoginInput {
            email: "israel@example.com".to_string(),
            password: "wrong-password".to_string(),
        })
        .await
        .unwrap_err();
    assert_eq!(invalid, AppError::InvalidCredentials);

    let valid = use_case
        .execute(LoginInput {
            email: "israel@example.com".to_string(),
            password: "Password123!".to_string(),
        })
        .await
        .unwrap();
    assert!(
        repo.sessions
            .lock()
            .unwrap()
            .contains_key(&hash_token(&valid.token))
    );
}

#[tokio::test]
async fn current_user_requires_valid_session_and_logout_revokes_it() {
    let repo = Arc::new(FakeAuthRepository::default());
    let user = user(Uuid::new_v4(), "israel@example.com");
    repo.users.lock().unwrap().insert(
        user.id,
        UserWithPassword {
            user: user.clone(),
            password_hash: hash_password("Password123!").unwrap(),
        },
    );
    repo.create_session(
        user.id,
        "session-hash",
        fixed_now() + chrono::Duration::days(30),
    )
    .await
    .unwrap();

    let current_user = GetCurrentUserUseCase::new(repo.clone(), clock())
        .execute("raw-token")
        .await
        .unwrap_err();
    assert_eq!(current_user, AppError::Unauthorized);

    assert!(
        repo.find_user_by_session_hash("session-hash", fixed_now())
            .await
            .unwrap()
            .is_some()
    );
    LogoutUseCase::new(repo.clone())
        .execute_hash("session-hash")
        .await
        .unwrap();
    assert!(
        repo.find_user_by_session_hash("session-hash", fixed_now())
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn password_reset_is_non_enumerating_single_use_and_revokes_sessions() {
    let repo = Arc::new(FakeAuthRepository::default());
    let email = Arc::new(FakeEmailSender::default());
    let user = user(Uuid::new_v4(), "israel@example.com");
    repo.users.lock().unwrap().insert(
        user.id,
        UserWithPassword {
            user: user.clone(),
            password_hash: hash_password("Password123!").unwrap(),
        },
    );
    repo.create_session(
        user.id,
        "old-session",
        fixed_now() + chrono::Duration::days(30),
    )
    .await
    .unwrap();

    let request = RequestPasswordResetUseCase::new(
        repo.clone(),
        email.clone(),
        clock(),
        "https://starter.example.com/".to_string(),
    );
    request
        .execute(RequestPasswordResetInput {
            email: "missing@example.com".to_string(),
        })
        .await
        .unwrap();
    assert!(email.sent.lock().unwrap().is_empty());

    request
        .execute(RequestPasswordResetInput {
            email: "israel@example.com".to_string(),
        })
        .await
        .unwrap();
    let sent = email.sent.lock().unwrap()[0].clone();
    assert_eq!(sent.to, "israel@example.com");
    assert_eq!(
        sent.expires_at,
        fixed_now() + chrono::Duration::minutes(PASSWORD_RESET_TTL_MINUTES)
    );
    let token = sent.reset_url.split("token=").nth(1).unwrap().to_string();
    assert!(
        repo.reset_tokens
            .lock()
            .unwrap()
            .contains_key(&hash_token(&token))
    );

    let reset = ResetPasswordUseCase::new(repo.clone(), clock());
    reset
        .execute(ResetPasswordInput {
            token: token.clone(),
            password: "NewPassword123!".to_string(),
        })
        .await
        .unwrap();
    assert!(repo.sessions.lock().unwrap().is_empty());

    assert!(
        reset
            .execute(ResetPasswordInput {
                token,
                password: "AnotherPassword123!".to_string(),
            })
            .await
            .is_err()
    );

    LoginUseCase::new(repo, clock())
        .execute(LoginInput {
            email: "israel@example.com".to_string(),
            password: "NewPassword123!".to_string(),
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn change_password_requires_current_password_and_keeps_current_session() {
    let repo = Arc::new(FakeAuthRepository::default());
    let user = user(Uuid::new_v4(), "israel@example.com");
    repo.users.lock().unwrap().insert(
        user.id,
        UserWithPassword {
            user: user.clone(),
            password_hash: hash_password("Password123!").unwrap(),
        },
    );
    repo.create_session(
        user.id,
        "current-session",
        fixed_now() + chrono::Duration::days(30),
    )
    .await
    .unwrap();
    repo.create_session(
        user.id,
        "other-session",
        fixed_now() + chrono::Duration::days(30),
    )
    .await
    .unwrap();

    let use_case = ChangePasswordUseCase::new(repo.clone());
    let invalid = use_case
        .execute(ChangePasswordInput {
            user_id: user.id,
            email: user.email.clone(),
            current_token_hash: "current-session".to_string(),
            current_password: "wrong".to_string(),
            new_password: "NewPassword123!".to_string(),
        })
        .await
        .unwrap_err();
    assert_eq!(invalid, AppError::InvalidCredentials);

    use_case
        .execute(ChangePasswordInput {
            user_id: user.id,
            email: user.email.clone(),
            current_token_hash: "current-session".to_string(),
            current_password: "Password123!".to_string(),
            new_password: "NewPassword123!".to_string(),
        })
        .await
        .unwrap();

    let users = repo.users.lock().unwrap();
    let hash = &users.get(&user.id).unwrap().password_hash;
    assert!(verify_password("NewPassword123!", hash));
    drop(users);

    let sessions = repo.sessions.lock().unwrap();
    assert!(sessions.contains_key("current-session"));
    assert!(!sessions.contains_key("other-session"));
}

#[tokio::test]
async fn owner_invites_member_and_accept_invite_adds_membership() {
    let repo = Arc::new(FakeWorkspaceRepository::default());
    let email = Arc::new(FakeEmailSender::default());
    let owner_id = Uuid::new_v4();
    let workspace = CreateWorkspaceUseCase::new(repo.clone())
        .execute(CreateWorkspaceInput {
            owner_id,
            name: "Product".to_string(),
        })
        .await
        .unwrap();

    let invite = InviteMemberUseCase::new(
        repo.clone(),
        email.clone(),
        clock(),
        "https://reason.example.com/".to_string(),
    )
    .execute(InviteMemberInput {
        actor_id: owner_id,
        actor_display_name: "Israel".to_string(),
        workspace_id: workspace.id,
        email: " invited@example.com ".to_string(),
        role: "editor".to_string(),
    })
    .await
    .unwrap();

    assert_eq!(invite.invite.email, "invited@example.com");
    assert_eq!(invite.invite.role, WorkspaceRole::Editor);
    assert_eq!(
        invite.invite.expires_at,
        fixed_now() + chrono::Duration::days(WORKSPACE_INVITE_TTL_DAYS)
    );
    assert_eq!(
        email.invite_sent.lock().unwrap()[0].to,
        "invited@example.com"
    );
    assert!(
        email.invite_sent.lock().unwrap()[0]
            .invite_url
            .contains(&invite.token)
    );

    let invited_user_id = Uuid::new_v4();
    let membership = AcceptInviteUseCase::new(repo.clone(), clock())
        .execute(AcceptInviteInput {
            token: invite.token,
            user_id: invited_user_id,
            user_email: "invited@example.com".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(membership.id, workspace.id);
    assert_eq!(membership.role, WorkspaceRole::Editor);
}

#[tokio::test]
async fn non_owner_cannot_invite_and_existing_member_conflicts() {
    let repo = Arc::new(FakeWorkspaceRepository::default());
    let email = Arc::new(FakeEmailSender::default());
    let owner_id = Uuid::new_v4();
    let workspace = CreateWorkspaceUseCase::new(repo.clone())
        .execute(CreateWorkspaceInput {
            owner_id,
            name: "Product".to_string(),
        })
        .await
        .unwrap();
    let invited_id = Uuid::new_v4();
    repo.workspaces.lock().unwrap().push((
        invited_id,
        WorkspaceMembership {
            id: workspace.id,
            name: workspace.name.clone(),
            role: WorkspaceRole::Editor,
            created_at: fixed_now(),
        },
    ));
    repo.members.lock().unwrap().push((
        workspace.id,
        WorkspaceMember {
            user_id: invited_id,
            email: "member@example.com".to_string(),
            display_name: "Member".to_string(),
            role: WorkspaceRole::Editor,
            joined_at: fixed_now(),
        },
    ));

    let use_case = InviteMemberUseCase::new(
        repo.clone(),
        email,
        clock(),
        "https://reason.example.com".to_string(),
    );
    let forbidden = use_case
        .execute(InviteMemberInput {
            actor_id: invited_id,
            actor_display_name: "Member".to_string(),
            workspace_id: workspace.id,
            email: "new@example.com".to_string(),
            role: "viewer".to_string(),
        })
        .await
        .unwrap_err();
    assert_eq!(forbidden, AppError::Forbidden);

    let already_member = use_case
        .execute(InviteMemberInput {
            actor_id: owner_id,
            actor_display_name: "Owner".to_string(),
            workspace_id: workspace.id,
            email: "member@example.com".to_string(),
            role: "viewer".to_string(),
        })
        .await
        .unwrap_err();
    assert_eq!(already_member, AppError::AlreadyMember);
}

#[tokio::test]
async fn cannot_remove_or_demote_last_owner() {
    let repo = Arc::new(FakeWorkspaceRepository::default());
    let owner_id = Uuid::new_v4();
    let workspace = CreateWorkspaceUseCase::new(repo.clone())
        .execute(CreateWorkspaceInput {
            owner_id,
            name: "Product".to_string(),
        })
        .await
        .unwrap();

    let demote = UpdateMemberRoleUseCase::new(repo.clone())
        .execute(
            owner_id,
            workspace.id,
            owner_id,
            WorkspaceRole::Editor.as_str().to_string(),
        )
        .await
        .unwrap_err();
    assert!(matches!(demote, AppError::Domain(_)));

    let remove = RemoveMemberUseCase::new(repo.clone())
        .execute(owner_id, workspace.id, owner_id)
        .await
        .unwrap_err();
    assert!(matches!(remove, AppError::Domain(_)));
}

type ListedOperationRange = (i64, Option<i64>, Option<i64>);

#[derive(Default)]
struct FakePageRepository {
    applied: Mutex<Vec<Operation>>,
    listed_ranges: Mutex<Vec<ListedOperationRange>>,
    search_calls: Mutex<Vec<(Uuid, String, i64)>>,
    public_link: Mutex<Option<PublicLink>>,
    public_page: Mutex<Option<PageTree>>,
    public_link_creates: Mutex<Vec<(Uuid, Uuid, Uuid)>>,
    public_link_revokes: Mutex<Vec<(Uuid, Uuid)>>,
    purge_calls: Mutex<Vec<(Uuid, Uuid)>>,
    transfer_calls: Mutex<Vec<(Uuid, Uuid, Uuid)>>,
}

#[async_trait]
impl PageRepository for FakePageRepository {
    async fn list_pages(&self, workspace_id: Uuid) -> Result<PageList, RepositoryError> {
        Ok(PageList {
            root_page_id: workspace_id,
            pages: Vec::new(),
        })
    }

    async fn get_page(
        &self,
        _workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<PageView, RepositoryError> {
        Ok(PageView {
            page: PageTree {
                root_id: page_id,
                blocks: Vec::new(),
            },
            breadcrumbs: Vec::new(),
            seq: 0,
            recent_editors: Vec::new(),
        })
    }

    async fn list_trash(&self, _workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError> {
        Ok(Vec::new())
    }

    async fn apply_operation(
        &self,
        _workspace_id: Uuid,
        _actor_id: Uuid,
        operation: &Operation,
        _now: DateTime<Utc>,
    ) -> Result<OperationAck, RepositoryError> {
        let mut applied = self.applied.lock().unwrap();
        applied.push(operation.clone());
        Ok(OperationAck {
            op_id: operation.op_id(),
            seq: applied.len() as i64,
        })
    }

    async fn list_operations_after(
        &self,
        _workspace_id: Uuid,
        after_seq: i64,
        limit: Option<i64>,
        up_to_seq: Option<i64>,
    ) -> Result<crate::application::ports::page::OperationsPage, RepositoryError> {
        self.listed_ranges
            .lock()
            .unwrap()
            .push((after_seq, limit, up_to_seq));
        Ok(crate::application::ports::page::OperationsPage {
            operations: Vec::new(),
            latest_seq: self.applied.lock().unwrap().len() as i64,
        })
    }

    async fn search(
        &self,
        user_id: Uuid,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchResult>, RepositoryError> {
        self.search_calls
            .lock()
            .unwrap()
            .push((user_id, query.to_string(), limit));
        Ok(vec![])
    }

    async fn get_public_link(
        &self,
        _workspace_id: Uuid,
        _page_id: Uuid,
    ) -> Result<Option<PublicLink>, RepositoryError> {
        Ok(self.public_link.lock().unwrap().clone())
    }

    async fn create_public_link(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
        created_by: Uuid,
        now: DateTime<Utc>,
    ) -> Result<PublicLink, RepositoryError> {
        self.public_link_creates
            .lock()
            .unwrap()
            .push((workspace_id, page_id, created_by));
        let link = PublicLink {
            token: Uuid::new_v4(),
            created_at: now,
        };
        *self.public_link.lock().unwrap() = Some(link.clone());
        Ok(link)
    }

    async fn revoke_public_link(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        self.public_link_revokes
            .lock()
            .unwrap()
            .push((workspace_id, page_id));
        Ok(self.public_link.lock().unwrap().take().is_some())
    }

    async fn get_public_page(&self, _token: Uuid) -> Result<PageTree, RepositoryError> {
        self.public_page
            .lock()
            .unwrap()
            .clone()
            .ok_or(RepositoryError::Domain(
                crate::domain::error::DomainError::PageNotFound,
            ))
    }

    async fn permanently_delete(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<PermanentDeleteResult, RepositoryError> {
        self.purge_calls
            .lock()
            .unwrap()
            .push((workspace_id, block_id));
        Ok(PermanentDeleteResult {
            deleted_blocks: 3,
            media_cleanup_queued: 1,
        })
    }

    async fn transfer_subtree(
        &self,
        source_workspace_id: Uuid,
        destination_workspace_id: Uuid,
        block_id: Uuid,
        transfer_id: Uuid,
        actor_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<TransferSubtreeResult, RepositoryError> {
        self.transfer_calls.lock().unwrap().push((
            source_workspace_id,
            destination_workspace_id,
            block_id,
        ));
        let source_operation = Operation::TransferSubtreeOut {
            op_id: transfer_id,
            transfer_id,
            block_id,
            destination_workspace_id,
        };
        let destination_operation = Operation::TransferSubtreeIn {
            op_id: Uuid::new_v4(),
            transfer_id,
            blocks: Vec::new(),
            parent_id: Uuid::new_v4(),
            index: 0,
            source_workspace_id,
        };
        Ok(TransferSubtreeResult {
            source: AppliedOperation {
                envelope: LoggedOperation {
                    seq: 1,
                    op_id: source_operation.op_id(),
                    actor_id,
                    operation: source_operation,
                    group: None,
                },
                inserted: true,
            },
            destination: AppliedOperation {
                envelope: LoggedOperation {
                    seq: 1,
                    op_id: destination_operation.op_id(),
                    actor_id,
                    operation: destination_operation,
                    group: None,
                },
                inserted: true,
            },
        })
    }
}

fn membership(workspace_id: Uuid, role: WorkspaceRole) -> WorkspaceMembership {
    WorkspaceMembership {
        id: workspace_id,
        name: "Pessoal".to_string(),
        role,
        created_at: fixed_now(),
    }
}

fn delete_op(block_id: Uuid) -> Operation {
    Operation::DeleteBlock {
        op_id: Uuid::new_v4(),
        block_id,
    }
}

struct PagesFixture {
    workspace_id: Uuid,
    owner_id: Uuid,
    editor_id: Uuid,
    viewer_id: Uuid,
    stranger_id: Uuid,
    pages: Arc<FakePageRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
}

fn pages_fixture() -> PagesFixture {
    let workspace_id = Uuid::new_v4();
    let repo = Arc::new(FakeWorkspaceRepository::default());
    let owner_id = Uuid::new_v4();
    let editor_id = Uuid::new_v4();
    let viewer_id = Uuid::new_v4();
    {
        let mut workspaces = repo.workspaces.lock().unwrap();
        workspaces.push((owner_id, membership(workspace_id, WorkspaceRole::Owner)));
        workspaces.push((editor_id, membership(workspace_id, WorkspaceRole::Editor)));
        workspaces.push((viewer_id, membership(workspace_id, WorkspaceRole::Viewer)));
    }

    PagesFixture {
        workspace_id,
        owner_id,
        editor_id,
        viewer_id,
        stranger_id: Uuid::new_v4(),
        pages: Arc::new(FakePageRepository::default()),
        workspaces: repo,
    }
}

#[tokio::test]
async fn owner_deletes_workspace_but_editor_cannot() {
    let workspace_id = Uuid::new_v4();
    let owner_id = Uuid::new_v4();
    let editor_id = Uuid::new_v4();
    let repo = Arc::new(FakeWorkspaceRepository::default());
    {
        let mut workspaces = repo.workspaces.lock().unwrap();
        workspaces.push((owner_id, membership(workspace_id, WorkspaceRole::Owner)));
        workspaces.push((editor_id, membership(workspace_id, WorkspaceRole::Editor)));
    }
    repo.members.lock().unwrap().push((
        workspace_id,
        WorkspaceMember {
            user_id: owner_id,
            email: "owner@example.com".to_string(),
            display_name: "Owner".to_string(),
            role: WorkspaceRole::Owner,
            joined_at: fixed_now(),
        },
    ));

    let use_case = DeleteWorkspaceUseCase::new(repo.clone());
    assert_eq!(
        use_case.execute(editor_id, workspace_id).await.unwrap_err(),
        AppError::Forbidden
    );
    assert!(
        repo.find_membership(workspace_id, owner_id)
            .await
            .unwrap()
            .is_some()
    );

    use_case.execute(owner_id, workspace_id).await.unwrap();
    assert!(repo.list_members(workspace_id).await.unwrap().is_empty());
    assert!(
        repo.find_membership(workspace_id, owner_id)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn every_member_reads_pages_and_trash() {
    let f = pages_fixture();
    let page_repository: Arc<dyn PageRepository> = f.pages.clone();
    let list = ListPagesUseCase::new(page_repository.clone(), f.workspaces.clone());
    let get = GetPageUseCase::new(page_repository.clone(), f.workspaces.clone());
    let trash = ListTrashUseCase::new(page_repository, f.workspaces.clone());

    for user_id in [f.owner_id, f.editor_id, f.viewer_id] {
        assert!(list.execute(user_id, f.workspace_id).await.is_ok());
        assert!(
            get.execute(user_id, f.workspace_id, Uuid::new_v4())
                .await
                .is_ok()
        );
        assert!(trash.execute(user_id, f.workspace_id).await.is_ok());
    }
}

#[tokio::test]
async fn operation_catch_up_preserves_the_requested_snapshot_bound() {
    let f = pages_fixture();
    let page_repository: Arc<dyn PageRepository> = f.pages.clone();
    let list = ListOperationsUseCase::new(page_repository, f.workspaces.clone());

    let page = list
        .execute(f.owner_id, f.workspace_id, 500, Some(200), Some(900))
        .await
        .unwrap();

    assert_eq!(page.latest_seq, 0);
    assert_eq!(
        f.pages.listed_ranges.lock().unwrap().as_slice(),
        &[(500, Some(200), Some(900))]
    );
}

#[tokio::test]
async fn non_member_cannot_read_or_write() {
    let f = pages_fixture();
    let page_repository: Arc<dyn PageRepository> = f.pages.clone();
    let clock: Arc<dyn Clock> = Arc::new(FixedClock { now: fixed_now() });

    let list = ListPagesUseCase::new(page_repository.clone(), f.workspaces.clone());
    assert_eq!(
        list.execute(f.stranger_id, f.workspace_id)
            .await
            .unwrap_err(),
        AppError::Forbidden
    );

    let get = GetPageUseCase::new(page_repository.clone(), f.workspaces.clone());
    assert_eq!(
        get.execute(f.stranger_id, f.workspace_id, Uuid::new_v4())
            .await
            .unwrap_err(),
        AppError::Forbidden
    );

    let apply = ApplyOperationUseCase::new(
        page_repository,
        f.workspaces.clone(),
        clock,
        crate::application::realtime::RealtimeHub::new(),
    );
    assert_eq!(
        apply
            .execute(f.stranger_id, f.workspace_id, delete_op(Uuid::new_v4()))
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert!(f.pages.applied.lock().unwrap().is_empty());
}

#[tokio::test]
async fn owner_and_editor_write_but_viewer_cannot() {
    let f = pages_fixture();
    let page_repository: Arc<dyn PageRepository> = f.pages.clone();
    let clock: Arc<dyn Clock> = Arc::new(FixedClock { now: fixed_now() });
    let apply = ApplyOperationUseCase::new(
        page_repository,
        f.workspaces.clone(),
        clock,
        crate::application::realtime::RealtimeHub::new(),
    );

    let owner_ack = apply
        .execute(f.owner_id, f.workspace_id, delete_op(Uuid::new_v4()))
        .await
        .unwrap();
    assert_eq!(owner_ack.seq, 1);

    let editor_ack = apply
        .execute(f.editor_id, f.workspace_id, delete_op(Uuid::new_v4()))
        .await
        .unwrap();
    assert_eq!(editor_ack.seq, 2);

    assert_eq!(
        apply
            .execute(f.viewer_id, f.workspace_id, delete_op(Uuid::new_v4()))
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert_eq!(f.pages.applied.lock().unwrap().len(), 2);

    assert_eq!(
        apply
            .execute_batch(
                f.viewer_id,
                f.workspace_id,
                vec![delete_op(Uuid::new_v4()), delete_op(Uuid::new_v4())],
                Some(crate::application::ports::page::OperationGroup {
                    id: Uuid::new_v4(),
                    source: "ai".to_string(),
                    provenance: serde_json::json!({"runId": Uuid::new_v4()}),
                }),
            )
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert_eq!(f.pages.applied.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn transferring_content_requires_owner_role_in_both_workspaces() {
    let source = Uuid::new_v4();
    let destination = Uuid::new_v4();
    let user_id = Uuid::new_v4();
    let workspaces = Arc::new(FakeWorkspaceRepository::default());
    workspaces.workspaces.lock().unwrap().extend([
        (user_id, membership(source, WorkspaceRole::Owner)),
        (user_id, membership(destination, WorkspaceRole::Editor)),
    ]);
    let pages = Arc::new(FakePageRepository::default());
    let use_case = TransferSubtreeUseCase::new(
        pages.clone(),
        workspaces.clone(),
        Arc::new(FixedClock { now: fixed_now() }),
        RealtimeHub::new(),
    );

    assert_eq!(
        use_case
            .execute(user_id, source, destination, Uuid::new_v4(), Uuid::new_v4(),)
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert!(pages.transfer_calls.lock().unwrap().is_empty());

    workspaces
        .workspaces
        .lock()
        .unwrap()
        .iter_mut()
        .find(|(_, membership)| membership.id == destination)
        .unwrap()
        .1
        .role = WorkspaceRole::Owner;
    use_case
        .execute(user_id, source, destination, Uuid::new_v4(), Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(pages.transfer_calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn m4_search_validates_bounds_and_forwards_normalized_input() {
    let f = pages_fixture();
    let pages: Arc<dyn PageRepository> = f.pages.clone();
    let search = SearchPagesUseCase::new(pages);

    assert!(matches!(
        search.execute(f.owner_id, "x".to_string(), None).await,
        Err(AppError::Domain(_))
    ));
    assert!(matches!(
        search
            .execute(f.owner_id, "valid".to_string(), Some(51))
            .await,
        Err(AppError::Domain(_))
    ));
    assert!(f.pages.search_calls.lock().unwrap().is_empty());

    search
        .execute(f.owner_id, "  design docs  ".to_string(), None)
        .await
        .unwrap();
    assert_eq!(
        f.pages.search_calls.lock().unwrap().as_slice(),
        &[(f.owner_id, "design docs".to_string(), 20)]
    );
}

#[tokio::test]
async fn m4_public_link_management_requires_writer_and_is_idempotent_at_repository_boundary() {
    let f = pages_fixture();
    let pages: Arc<dyn PageRepository> = f.pages.clone();
    let links = PublicLinksUseCase::new(
        pages,
        f.workspaces.clone(),
        clock(),
        "https://reason.test/".to_string(),
    );
    let page_id = Uuid::new_v4();

    for writer in [f.owner_id, f.editor_id] {
        let link = links.create(writer, f.workspace_id, page_id).await.unwrap();
        assert_eq!(
            link.url,
            format!("https://reason.test/share/{}", link.token)
        );
        assert!(
            links
                .get(writer, f.workspace_id, page_id)
                .await
                .unwrap()
                .is_some()
        );
    }

    assert_eq!(
        links
            .create(f.viewer_id, f.workspace_id, page_id)
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert_eq!(
        links
            .get(f.viewer_id, f.workspace_id, page_id)
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert_eq!(
        links
            .revoke(f.viewer_id, f.workspace_id, page_id)
            .await
            .unwrap_err(),
        AppError::Forbidden
    );

    links
        .revoke(f.editor_id, f.workspace_id, page_id)
        .await
        .unwrap();
    assert!(f.pages.public_link.lock().unwrap().is_none());
}

#[tokio::test]
async fn m4_public_page_is_anonymous_and_contains_only_repository_sanitized_tree() {
    let f = pages_fixture();
    let pages: Arc<dyn PageRepository> = f.pages.clone();
    let root_id = Uuid::new_v4();
    *f.pages.public_page.lock().unwrap() = Some(PageTree {
        root_id,
        blocks: vec![],
    });
    let links = PublicLinksUseCase::new(
        pages,
        f.workspaces,
        clock(),
        "https://reason.test".to_string(),
    );

    let response = links.public_page(Uuid::new_v4()).await.unwrap();
    assert_eq!(response.page.root_id, root_id);
    assert!(response.page.blocks.is_empty());
}

#[tokio::test]
async fn m4_permanent_delete_allows_owner_and_editor_but_not_viewer() {
    let f = pages_fixture();
    let pages: Arc<dyn PageRepository> = f.pages.clone();
    let purge = PermanentlyDeleteUseCase::new(pages, f.workspaces.clone(), clock());

    for writer in [f.owner_id, f.editor_id] {
        let result = purge
            .execute(writer, f.workspace_id, Uuid::new_v4())
            .await
            .unwrap();
        assert_eq!(result.deleted_blocks, 3);
        assert_eq!(result.media_cleanup_queued, 1);
    }
    assert_eq!(
        purge
            .execute(f.viewer_id, f.workspace_id, Uuid::new_v4())
            .await
            .unwrap_err(),
        AppError::Forbidden
    );
    assert_eq!(f.pages.purge_calls.lock().unwrap().len(), 2);
}
