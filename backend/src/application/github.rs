use std::sync::Arc;

use chrono::Duration;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::github::{
    CreateInstallationState, GitHubGateway, GitHubGatewayError, GitHubInstallation,
    GitHubIntegrationStatus, GitHubPullRequestFiles, GitHubPullRequestLink, GitHubRepository,
    SavePullRequestLink,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::{require_member, require_owner, require_writer};
use crate::domain::auth::session::{generate_token, hash_token};
use crate::domain::error::DomainError;
use crate::domain::github::parse_pull_request_url;

pub const INSTALLATION_STATE_TTL_MINUTES: i64 = 10;

const INVALID_INSTALLATION_STATE: &str = "GitHub installation state is invalid or expired";
const INVALID_INSTALLATION: &str = "GitHub installation could not be verified";
const INVALID_OAUTH_CODE: &str = "GitHub OAuth code is invalid";
const PULL_REQUEST_UNAVAILABLE: &str =
    "GitHub pull request was not found or is not accessible to this installation";
const INSTALLATION_REQUIRED: &str = "GitHub App must be installed for this workspace first";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BeginGitHubInstallation {
    pub installation_url: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BeginGitHubInstallationInput {
    pub return_page_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetupGitHubInstallationInput {
    pub state: String,
    pub installation_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompleteGitHubOAuthInput {
    pub code: Option<String>,
    pub state: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompleteGitHubOAuth {
    pub return_page_id: Uuid,
    pub success: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkGitHubPullRequestInput {
    pub url: String,
}

#[derive(Clone)]
pub struct GitHubUseCases {
    repository: Arc<dyn GitHubRepository>,
    gateway: Option<Arc<dyn GitHubGateway>>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl GitHubUseCases {
    pub fn new(
        repository: Arc<dyn GitHubRepository>,
        gateway: Option<Arc<dyn GitHubGateway>>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            repository,
            gateway,
            workspaces,
            clock,
        }
    }

    pub async fn begin_installation(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        input: BeginGitHubInstallationInput,
    ) -> Result<BeginGitHubInstallation, AppError> {
        require_owner(&self.workspaces, workspace_id, user_id).await?;
        self.repository
            .validate_pull_request_link_target(workspace_id, input.return_page_id)
            .await?;
        let gateway = self.gateway.as_ref().ok_or(AppError::GitHubNotConfigured)?;
        let now = self.clock.now();
        let state = generate_token();
        let expires_at = now + Duration::minutes(INSTALLATION_STATE_TTL_MINUTES);
        self.repository
            .create_installation_state(CreateInstallationState {
                id: Uuid::new_v4(),
                workspace_id,
                initiated_by: user_id,
                return_page_id: input.return_page_id,
                state_hash: hash_token(&state),
                expires_at,
                created_at: now,
            })
            .await?;
        Ok(BeginGitHubInstallation {
            installation_url: gateway.installation_url(&state),
            expires_at,
        })
    }

    pub async fn setup_installation(
        &self,
        input: SetupGitHubInstallationInput,
    ) -> Result<String, AppError> {
        if input.state.is_empty() || input.installation_id <= 0 {
            return Err(DomainError::Validation(INVALID_INSTALLATION_STATE).into());
        }
        let gateway = self.gateway.as_ref().ok_or(AppError::GitHubNotConfigured)?;
        let now = self.clock.now();
        let oauth_state = generate_token();
        let expires_at = now + Duration::minutes(INSTALLATION_STATE_TTL_MINUTES);
        let exchanged = self
            .repository
            .exchange_setup_state(
                &hash_token(&input.state),
                input.installation_id,
                Uuid::new_v4(),
                &hash_token(&oauth_state),
                expires_at,
                now,
            )
            .await?;
        if !exchanged {
            return Err(DomainError::Validation(INVALID_INSTALLATION_STATE).into());
        }
        Ok(gateway.oauth_authorization_url(&oauth_state))
    }

    pub async fn complete_oauth(
        &self,
        input: CompleteGitHubOAuthInput,
    ) -> Result<CompleteGitHubOAuth, AppError> {
        if input.state.is_empty() {
            return Err(DomainError::Validation(INVALID_INSTALLATION_STATE).into());
        }
        let gateway = self.gateway.as_ref().ok_or(AppError::GitHubNotConfigured)?;
        let now = self.clock.now();
        let pending = self
            .repository
            .consume_oauth_state(&hash_token(&input.state), now)
            .await?
            .ok_or(DomainError::Validation(INVALID_INSTALLATION_STATE))?;
        let return_page_id = pending.return_page_id;
        let Some(code) = input.code.filter(|code| !code.is_empty()) else {
            return Ok(CompleteGitHubOAuth {
                return_page_id,
                success: false,
            });
        };
        if input.error.is_some() {
            return Ok(CompleteGitHubOAuth {
                return_page_id,
                success: false,
            });
        }
        let result: Result<GitHubInstallation, AppError> = async {
            require_owner(&self.workspaces, pending.workspace_id, pending.initiated_by).await?;
            let user_token = gateway
                .exchange_oauth_code(&code)
                .await
                .map_err(|error| map_gateway_error(error, INVALID_OAUTH_CODE))?;
            let has_access = gateway
                .user_has_installation_access(&user_token, pending.installation_id)
                .await
                .map_err(|error| map_gateway_error(error, INVALID_INSTALLATION))?;
            if !has_access {
                return Err(DomainError::Validation(INVALID_INSTALLATION).into());
            }
            let installation = gateway
                .get_installation(pending.installation_id, now)
                .await
                .map_err(|error| map_gateway_error(error, INVALID_INSTALLATION))?;
            if installation.installation_id != pending.installation_id {
                return Err(DomainError::Validation(INVALID_INSTALLATION).into());
            }
            self.repository
                .save_installation(pending, installation, now)
                .await
                .map_err(Into::into)
        }
        .await;
        Ok(CompleteGitHubOAuth {
            return_page_id,
            success: result.is_ok(),
        })
    }

    pub async fn list_installations(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<GitHubIntegrationStatus, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        let installations = self.repository.list_installations(workspace_id).await?;
        Ok(GitHubIntegrationStatus {
            configured: self.gateway.is_some(),
            installations,
        })
    }

    pub async fn link_pull_request(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
        input: LinkGitHubPullRequestInput,
    ) -> Result<GitHubPullRequestLink, AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        let pull_request = parse_pull_request_url(&input.url)?;
        self.repository
            .validate_pull_request_link_target(workspace_id, block_id)
            .await?;
        let gateway = self.gateway.as_ref().ok_or(AppError::GitHubNotConfigured)?;
        let installation = self
            .repository
            .find_installation(workspace_id)
            .await?
            .ok_or(DomainError::Validation(INSTALLATION_REQUIRED))?;
        let now = self.clock.now();
        let snapshot = gateway
            .get_pull_request(installation.installation_id, &pull_request, now)
            .await
            .map_err(|error| map_gateway_error(error, PULL_REQUEST_UNAVAILABLE))?;
        self.repository
            .save_pull_request_link(SavePullRequestLink {
                id: Uuid::new_v4(),
                workspace_id,
                block_id,
                pull_request,
                snapshot,
                linked_by: user_id,
                now,
            })
            .await
            .map_err(Into::into)
    }

    pub async fn list_pull_request_links(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Vec<GitHubPullRequestLink>, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        self.repository
            .list_pull_request_links(workspace_id)
            .await
            .map_err(Into::into)
    }

    pub async fn get_pull_request_link(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<Option<GitHubPullRequestLink>, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        Ok(self
            .repository
            .find_pull_request_link(workspace_id, block_id)
            .await?
            .map(|context| context.link))
    }

    pub async fn list_pull_request_files(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<GitHubPullRequestFiles, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        let context = self
            .repository
            .find_pull_request_link(workspace_id, block_id)
            .await?
            .ok_or(AppError::GitHubPullRequestNotFound)?;
        let gateway = self.gateway.as_ref().ok_or(AppError::GitHubNotConfigured)?;
        let pull_request = crate::domain::github::GitHubPullRequestRef {
            owner: context.link.owner,
            repository: context.link.repository,
            number: context.link.pull_number,
        };
        let batch = gateway
            .list_pull_request_files(context.installation_id, &pull_request, self.clock.now())
            .await
            .map_err(map_pull_request_files_error)?;
        let minimum_total = batch.files.len() as i64 + i64::from(batch.limit_reached);
        let total_changed_files = context.link.changed_files.max(minimum_total);
        Ok(GitHubPullRequestFiles {
            truncated: batch.limit_reached || total_changed_files > batch.files.len() as i64,
            files: batch.files,
            total_changed_files,
        })
    }

    pub async fn unlink_pull_request(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        self.repository
            .delete_pull_request_link(workspace_id, block_id)
            .await
            .map_err(Into::into)
    }
}

fn map_gateway_error(error: GitHubGatewayError, message: &'static str) -> AppError {
    match error {
        GitHubGatewayError::Unauthorized | GitHubGatewayError::NotFound => {
            DomainError::Validation(message).into()
        }
        GitHubGatewayError::Unexpected => AppError::GitHubUnavailable,
    }
}

fn map_pull_request_files_error(error: GitHubGatewayError) -> AppError {
    match error {
        GitHubGatewayError::Unauthorized | GitHubGatewayError::NotFound => {
            AppError::GitHubPullRequestNotFound
        }
        GitHubGatewayError::Unexpected => AppError::GitHubUnavailable,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use async_trait::async_trait;
    use chrono::{DateTime, TimeZone, Utc};

    use super::*;
    use crate::application::ports::RepositoryError;
    use crate::application::ports::clock::FixedClock;
    use crate::application::ports::github::{
        GitHubInstallationSnapshot, GitHubPullRequestFile, GitHubPullRequestFileBatch,
        GitHubPullRequestLinkContext, GitHubPullRequestSnapshot, PendingGitHubInstallation,
    };
    use crate::application::ports::workspace::CreateWorkspaceInviteRecord;
    use crate::domain::workspace::{
        Workspace, WorkspaceInvite, WorkspaceInvitePreview, WorkspaceMember, WorkspaceMembership,
        WorkspaceRole,
    };

    struct FakeWorkspaceRepository {
        role: Option<WorkspaceRole>,
    }

    #[async_trait]
    impl WorkspaceRepository for FakeWorkspaceRepository {
        async fn list_for_user(
            &self,
            _user_id: Uuid,
        ) -> Result<Vec<WorkspaceMembership>, RepositoryError> {
            unimplemented!()
        }

        async fn create_for_owner(
            &self,
            _owner_id: Uuid,
            _name: String,
        ) -> Result<Workspace, RepositoryError> {
            unimplemented!()
        }

        async fn find_membership(
            &self,
            workspace_id: Uuid,
            _user_id: Uuid,
        ) -> Result<Option<WorkspaceMembership>, RepositoryError> {
            Ok(self.role.map(|role| WorkspaceMembership {
                id: workspace_id,
                name: "Reason".into(),
                role,
                created_at: now(),
            }))
        }

        async fn list_members(
            &self,
            _workspace_id: Uuid,
        ) -> Result<Vec<WorkspaceMember>, RepositoryError> {
            unimplemented!()
        }

        async fn find_member_by_email(
            &self,
            _workspace_id: Uuid,
            _email: &str,
        ) -> Result<Option<WorkspaceMember>, RepositoryError> {
            unimplemented!()
        }

        async fn count_owners(&self, _workspace_id: Uuid) -> Result<i64, RepositoryError> {
            unimplemented!()
        }

        async fn list_pending_invites(
            &self,
            _workspace_id: Uuid,
            _now: DateTime<Utc>,
        ) -> Result<Vec<WorkspaceInvite>, RepositoryError> {
            unimplemented!()
        }

        async fn revoke_open_invite(
            &self,
            _workspace_id: Uuid,
            _email: &str,
            _revoked_at: DateTime<Utc>,
        ) -> Result<(), RepositoryError> {
            unimplemented!()
        }

        async fn revoke_invite(
            &self,
            _workspace_id: Uuid,
            _invite_id: Uuid,
            _revoked_at: DateTime<Utc>,
        ) -> Result<(), RepositoryError> {
            unimplemented!()
        }

        async fn create_invite(
            &self,
            _input: CreateWorkspaceInviteRecord,
        ) -> Result<WorkspaceInvite, RepositoryError> {
            unimplemented!()
        }

        async fn find_invite_preview_by_token_hash(
            &self,
            _token_hash: &str,
            _now: DateTime<Utc>,
        ) -> Result<Option<WorkspaceInvitePreview>, RepositoryError> {
            unimplemented!()
        }

        async fn find_invite_by_token_hash(
            &self,
            _token_hash: &str,
        ) -> Result<Option<WorkspaceInvite>, RepositoryError> {
            unimplemented!()
        }

        async fn accept_invite(
            &self,
            _invite_id: Uuid,
            _user_id: Uuid,
            _accepted_at: DateTime<Utc>,
        ) -> Result<WorkspaceMembership, RepositoryError> {
            unimplemented!()
        }

        async fn update_member_role(
            &self,
            _workspace_id: Uuid,
            _user_id: Uuid,
            _role: WorkspaceRole,
        ) -> Result<(), RepositoryError> {
            unimplemented!()
        }

        async fn remove_member(
            &self,
            _workspace_id: Uuid,
            _user_id: Uuid,
        ) -> Result<(), RepositoryError> {
            unimplemented!()
        }

        async fn delete_workspace(&self, _workspace_id: Uuid) -> Result<(), RepositoryError> {
            unimplemented!()
        }
    }

    #[derive(Default)]
    struct FakeGitHubRepository {
        state: Mutex<Option<CreateInstallationState>>,
        oauth_state: Mutex<
            Option<(
                String,
                PendingGitHubInstallation,
                chrono::DateTime<chrono::Utc>,
            )>,
        >,
        installation: Mutex<Option<GitHubInstallation>>,
        links: Mutex<Vec<GitHubPullRequestLink>>,
        invalid_link_targets: Mutex<Vec<Uuid>>,
        find_link_calls: AtomicUsize,
    }

    #[async_trait]
    impl GitHubRepository for FakeGitHubRepository {
        async fn create_installation_state(
            &self,
            input: CreateInstallationState,
        ) -> Result<(), RepositoryError> {
            *self.state.lock().unwrap() = Some(input);
            Ok(())
        }

        async fn exchange_setup_state(
            &self,
            state_hash: &str,
            installation_id: i64,
            _oauth_state_id: Uuid,
            oauth_state_hash: &str,
            expires_at: DateTime<Utc>,
            now: DateTime<Utc>,
        ) -> Result<bool, RepositoryError> {
            let mut stored_state = self.state.lock().unwrap();
            let Some(state) = stored_state.as_ref() else {
                return Ok(false);
            };
            if state.state_hash != state_hash || state.expires_at <= now {
                return Ok(false);
            }
            let state = stored_state.take().unwrap();
            *self.oauth_state.lock().unwrap() = Some((
                oauth_state_hash.into(),
                PendingGitHubInstallation {
                    workspace_id: state.workspace_id,
                    initiated_by: state.initiated_by,
                    installation_id,
                    return_page_id: state.return_page_id,
                },
                expires_at,
            ));
            Ok(true)
        }

        async fn consume_oauth_state(
            &self,
            state_hash: &str,
            now: DateTime<Utc>,
        ) -> Result<Option<PendingGitHubInstallation>, RepositoryError> {
            let mut oauth_state = self.oauth_state.lock().unwrap();
            if oauth_state
                .as_ref()
                .is_some_and(|(hash, _, expires_at)| hash == state_hash && *expires_at > now)
            {
                Ok(oauth_state.take().map(|(_, pending, _)| pending))
            } else {
                Ok(None)
            }
        }

        async fn save_installation(
            &self,
            pending: PendingGitHubInstallation,
            installation: GitHubInstallationSnapshot,
            completed_at: DateTime<Utc>,
        ) -> Result<GitHubInstallation, RepositoryError> {
            let record = GitHubInstallation {
                id: Uuid::new_v4(),
                workspace_id: pending.workspace_id,
                installation_id: installation.installation_id,
                account_login: installation.account_login,
                account_type: installation.account_type,
                created_at: completed_at,
                updated_at: completed_at,
            };
            *self.installation.lock().unwrap() = Some(record.clone());
            Ok(record)
        }

        async fn list_installations(
            &self,
            workspace_id: Uuid,
        ) -> Result<Vec<GitHubInstallation>, RepositoryError> {
            Ok(self
                .installation
                .lock()
                .unwrap()
                .iter()
                .filter(|installation| installation.workspace_id == workspace_id)
                .cloned()
                .collect())
        }

        async fn find_installation(
            &self,
            workspace_id: Uuid,
        ) -> Result<Option<GitHubInstallation>, RepositoryError> {
            Ok(self
                .installation
                .lock()
                .unwrap()
                .clone()
                .filter(|installation| installation.workspace_id == workspace_id))
        }

        async fn validate_pull_request_link_target(
            &self,
            _workspace_id: Uuid,
            block_id: Uuid,
        ) -> Result<(), RepositoryError> {
            if self
                .invalid_link_targets
                .lock()
                .unwrap()
                .contains(&block_id)
            {
                Err(DomainError::Validation(
                    "GitHub pull requests can only be linked to a page or database row in this workspace",
                )
                .into())
            } else {
                Ok(())
            }
        }

        async fn save_pull_request_link(
            &self,
            input: SavePullRequestLink,
        ) -> Result<GitHubPullRequestLink, RepositoryError> {
            let link = GitHubPullRequestLink {
                id: input.id,
                workspace_id: input.workspace_id,
                block_id: input.block_id,
                owner: input.pull_request.owner,
                repository: input.pull_request.repository,
                pull_number: input.pull_request.number,
                url: input.snapshot.url,
                title: input.snapshot.title,
                body: input.snapshot.body,
                state: input.snapshot.state,
                draft: input.snapshot.draft,
                author_login: input.snapshot.author_login,
                head_sha: input.snapshot.head_sha,
                base_ref: input.snapshot.base_ref,
                head_ref: input.snapshot.head_ref,
                additions: input.snapshot.additions,
                deletions: input.snapshot.deletions,
                changed_files: input.snapshot.changed_files,
                created_at: input.now,
                updated_at: input.now,
            };
            self.links.lock().unwrap().push(link.clone());
            Ok(link)
        }

        async fn list_pull_request_links(
            &self,
            workspace_id: Uuid,
        ) -> Result<Vec<GitHubPullRequestLink>, RepositoryError> {
            Ok(self
                .links
                .lock()
                .unwrap()
                .iter()
                .filter(|link| link.workspace_id == workspace_id)
                .cloned()
                .collect())
        }

        async fn find_pull_request_link(
            &self,
            workspace_id: Uuid,
            block_id: Uuid,
        ) -> Result<Option<GitHubPullRequestLinkContext>, RepositoryError> {
            self.find_link_calls.fetch_add(1, Ordering::SeqCst);
            let link = self
                .links
                .lock()
                .unwrap()
                .iter()
                .find(|link| link.workspace_id == workspace_id && link.block_id == block_id)
                .cloned();
            let installation_id = self
                .installation
                .lock()
                .unwrap()
                .as_ref()
                .filter(|installation| installation.workspace_id == workspace_id)
                .map(|installation| installation.installation_id);
            Ok(link.zip(installation_id).map(|(link, installation_id)| {
                GitHubPullRequestLinkContext {
                    link,
                    installation_id,
                }
            }))
        }

        async fn delete_pull_request_link(
            &self,
            workspace_id: Uuid,
            block_id: Uuid,
        ) -> Result<(), RepositoryError> {
            let mut links = self.links.lock().unwrap();
            links.retain(|link| link.workspace_id != workspace_id || link.block_id != block_id);
            Ok(())
        }
    }

    struct FakeGitHubGateway {
        has_access: bool,
        installation_calls: AtomicUsize,
        pull_request_calls: AtomicUsize,
        file_calls: AtomicUsize,
        file_limit_reached: bool,
        file_installation_id: Mutex<Option<i64>>,
    }

    impl Default for FakeGitHubGateway {
        fn default() -> Self {
            Self {
                has_access: true,
                installation_calls: AtomicUsize::new(0),
                pull_request_calls: AtomicUsize::new(0),
                file_calls: AtomicUsize::new(0),
                file_limit_reached: false,
                file_installation_id: Mutex::new(None),
            }
        }
    }

    #[async_trait]
    impl GitHubGateway for FakeGitHubGateway {
        fn installation_url(&self, state: &str) -> String {
            format!("https://github.test/install?state={state}")
        }

        fn oauth_authorization_url(&self, state: &str) -> String {
            format!("https://github.test/oauth?state={state}")
        }

        async fn exchange_oauth_code(&self, _code: &str) -> Result<String, GitHubGatewayError> {
            Ok("user-token".into())
        }

        async fn user_has_installation_access(
            &self,
            _user_token: &str,
            _installation_id: i64,
        ) -> Result<bool, GitHubGatewayError> {
            Ok(self.has_access)
        }

        async fn get_installation(
            &self,
            installation_id: i64,
            _now: DateTime<Utc>,
        ) -> Result<GitHubInstallationSnapshot, GitHubGatewayError> {
            self.installation_calls.fetch_add(1, Ordering::SeqCst);
            Ok(GitHubInstallationSnapshot {
                installation_id,
                account_login: "acme".into(),
                account_type: "Organization".into(),
            })
        }

        async fn get_pull_request(
            &self,
            _installation_id: i64,
            pull_request: &crate::domain::github::GitHubPullRequestRef,
            _now: DateTime<Utc>,
        ) -> Result<GitHubPullRequestSnapshot, GitHubGatewayError> {
            self.pull_request_calls.fetch_add(1, Ordering::SeqCst);
            Ok(GitHubPullRequestSnapshot {
                url: format!(
                    "https://github.com/{}/{}/pull/{}",
                    pull_request.owner, pull_request.repository, pull_request.number
                ),
                title: "Ship GitHub links".into(),
                body: Some("Review this change".into()),
                state: "open".into(),
                draft: false,
                author_login: Some("octocat".into()),
                head_sha: "abc123".into(),
                base_ref: "main".into(),
                head_ref: "feature/github".into(),
                additions: 20,
                deletions: 4,
                changed_files: 2,
            })
        }

        async fn list_pull_request_files(
            &self,
            installation_id: i64,
            _pull_request: &crate::domain::github::GitHubPullRequestRef,
            _now: DateTime<Utc>,
        ) -> Result<GitHubPullRequestFileBatch, GitHubGatewayError> {
            self.file_calls.fetch_add(1, Ordering::SeqCst);
            *self.file_installation_id.lock().unwrap() = Some(installation_id);
            Ok(GitHubPullRequestFileBatch {
                files: vec![GitHubPullRequestFile {
                    path: "backend/src/github.rs".into(),
                    previous_filename: None,
                    status: "modified".into(),
                    additions: 8,
                    deletions: 2,
                    changes: 10,
                    patch: Some("@@ -1 +1 @@".into()),
                    blob_url: "https://github.com/acme/reason/blob/abc/backend/src/github.rs"
                        .into(),
                }],
                limit_reached: self.file_limit_reached,
            })
        }
    }

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 21, 12, 0, 0).unwrap()
    }

    fn use_cases(role: WorkspaceRole, repository: Arc<FakeGitHubRepository>) -> GitHubUseCases {
        use_cases_with_gateway(role, repository, Arc::new(FakeGitHubGateway::default()))
    }

    fn use_cases_with_gateway(
        role: WorkspaceRole,
        repository: Arc<FakeGitHubRepository>,
        gateway: Arc<FakeGitHubGateway>,
    ) -> GitHubUseCases {
        GitHubUseCases::new(
            repository,
            Some(gateway),
            Arc::new(FakeWorkspaceRepository { role: Some(role) }),
            Arc::new(FixedClock::new(now())),
        )
    }

    #[tokio::test]
    async fn owner_completes_setup_and_oauth_states_only_once() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let use_cases = use_cases(WorkspaceRole::Owner, Arc::clone(&repository));
        let user_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let return_page_id = Uuid::new_v4();
        let begin = use_cases
            .begin_installation(
                user_id,
                workspace_id,
                BeginGitHubInstallationInput { return_page_id },
            )
            .await
            .unwrap();
        let setup_state = begin.installation_url.split("state=").nth(1).unwrap();
        let oauth_url = use_cases
            .setup_installation(SetupGitHubInstallationInput {
                state: setup_state.into(),
                installation_id: 123,
            })
            .await
            .unwrap();
        assert!(
            use_cases
                .setup_installation(SetupGitHubInstallationInput {
                    state: setup_state.into(),
                    installation_id: 123,
                })
                .await
                .is_err()
        );
        let oauth_state = oauth_url.split("state=").nth(1).unwrap();
        let input = CompleteGitHubOAuthInput {
            code: Some("oauth-code".into()),
            state: oauth_state.into(),
            error: None,
        };

        let result = use_cases.complete_oauth(input.clone()).await.unwrap();
        assert!(result.success);
        assert_eq!(result.return_page_id, return_page_id);
        let installation = repository.installation.lock().unwrap().clone().unwrap();
        assert_eq!(installation.installation_id, 123);
        assert_eq!(installation.account_login, "acme");
        assert!(use_cases.complete_oauth(input).await.is_err());
    }

    #[tokio::test]
    async fn oauth_access_is_verified_before_installation_is_loaded_or_saved() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let gateway = Arc::new(FakeGitHubGateway {
            has_access: false,
            ..FakeGitHubGateway::default()
        });
        let use_cases =
            use_cases_with_gateway(WorkspaceRole::Owner, repository.clone(), gateway.clone());
        let user_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let begin = use_cases
            .begin_installation(
                user_id,
                workspace_id,
                BeginGitHubInstallationInput {
                    return_page_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let oauth_url = use_cases
            .setup_installation(SetupGitHubInstallationInput {
                state: begin
                    .installation_url
                    .split("state=")
                    .nth(1)
                    .unwrap()
                    .into(),
                installation_id: 123,
            })
            .await
            .unwrap();

        let result = use_cases
            .complete_oauth(CompleteGitHubOAuthInput {
                code: Some("oauth-code".into()),
                state: oauth_url.split("state=").nth(1).unwrap().into(),
                error: None,
            })
            .await
            .unwrap();
        assert!(!result.success);
        assert_eq!(gateway.installation_calls.load(Ordering::SeqCst), 0);
        assert!(repository.installation.lock().unwrap().is_none());
        assert!(repository.oauth_state.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn cancelled_oauth_returns_to_the_validated_page_without_exchanging_a_code() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let gateway = Arc::new(FakeGitHubGateway::default());
        let use_cases =
            use_cases_with_gateway(WorkspaceRole::Owner, repository, Arc::clone(&gateway));
        let user_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let return_page_id = Uuid::new_v4();
        let begin = use_cases
            .begin_installation(
                user_id,
                workspace_id,
                BeginGitHubInstallationInput { return_page_id },
            )
            .await
            .unwrap();
        let oauth_url = use_cases
            .setup_installation(SetupGitHubInstallationInput {
                state: begin
                    .installation_url
                    .split("state=")
                    .nth(1)
                    .unwrap()
                    .into(),
                installation_id: 123,
            })
            .await
            .unwrap();

        let result = use_cases
            .complete_oauth(CompleteGitHubOAuthInput {
                code: None,
                state: oauth_url.split("state=").nth(1).unwrap().into(),
                error: Some("access_denied".into()),
            })
            .await
            .unwrap();

        assert!(!result.success);
        assert_eq!(result.return_page_id, return_page_id);
        assert_eq!(gateway.installation_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn unlink_is_idempotent_when_link_does_not_exist() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let use_cases = use_cases(WorkspaceRole::Editor, repository);

        use_cases
            .unlink_pull_request(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn viewer_can_list_but_cannot_manage_github_integration() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let use_cases = use_cases(WorkspaceRole::Viewer, repository);
        let user_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();

        assert_eq!(
            use_cases
                .list_installations(user_id, workspace_id)
                .await
                .unwrap(),
            GitHubIntegrationStatus {
                configured: true,
                installations: Vec::new(),
            }
        );
        assert_eq!(
            use_cases
                .begin_installation(
                    user_id,
                    workspace_id,
                    BeginGitHubInstallationInput {
                        return_page_id: Uuid::new_v4(),
                    },
                )
                .await
                .unwrap_err(),
            AppError::Forbidden
        );
        assert_eq!(
            use_cases
                .link_pull_request(
                    user_id,
                    workspace_id,
                    Uuid::new_v4(),
                    LinkGitHubPullRequestInput {
                        url: "https://github.com/acme/reason/pull/42".into(),
                    },
                )
                .await
                .unwrap_err(),
            AppError::Forbidden
        );
    }

    #[tokio::test]
    async fn editor_links_a_canonical_pull_request() {
        let workspace_id = Uuid::new_v4();
        let repository = Arc::new(FakeGitHubRepository::default());
        *repository.installation.lock().unwrap() = Some(GitHubInstallation {
            id: Uuid::new_v4(),
            workspace_id,
            installation_id: 123,
            account_login: "acme".into(),
            account_type: "Organization".into(),
            created_at: now(),
            updated_at: now(),
        });
        let use_cases = use_cases(WorkspaceRole::Editor, repository);

        let link = use_cases
            .link_pull_request(
                Uuid::new_v4(),
                workspace_id,
                Uuid::new_v4(),
                LinkGitHubPullRequestInput {
                    url: "https://github.com/acme/reason/pull/42".into(),
                },
            )
            .await
            .unwrap();
        assert_eq!(link.owner, "acme");
        assert_eq!(link.repository, "reason");
        assert_eq!(link.pull_number, 42);
        assert_eq!(link.head_sha, "abc123");
        assert_eq!(link.base_ref, "main");
        assert_eq!(link.changed_files, 2);
    }

    #[tokio::test]
    async fn viewer_lists_files_with_the_linked_workspaces_installation() {
        let workspace_id = Uuid::new_v4();
        let block_id = Uuid::new_v4();
        let repository = Arc::new(FakeGitHubRepository::default());
        *repository.installation.lock().unwrap() = Some(fake_installation(workspace_id, 123));
        repository
            .links
            .lock()
            .unwrap()
            .push(fake_link(workspace_id, block_id));
        let gateway = Arc::new(FakeGitHubGateway::default());
        let use_cases =
            use_cases_with_gateway(WorkspaceRole::Viewer, repository, Arc::clone(&gateway));

        let response = use_cases
            .list_pull_request_files(Uuid::new_v4(), workspace_id, block_id)
            .await
            .unwrap();

        assert_eq!(response.files.len(), 1);
        assert_eq!(response.files[0].path, "backend/src/github.rs");
        assert!(!response.truncated);
        assert_eq!(response.total_changed_files, 1);
        assert_eq!(*gateway.file_installation_id.lock().unwrap(), Some(123));
    }

    #[tokio::test]
    async fn invalid_link_target_is_rejected_before_github_is_called() {
        let workspace_id = Uuid::new_v4();
        let block_id = Uuid::new_v4();
        let repository = Arc::new(FakeGitHubRepository::default());
        repository
            .invalid_link_targets
            .lock()
            .unwrap()
            .push(block_id);
        *repository.installation.lock().unwrap() = Some(fake_installation(workspace_id, 123));
        let gateway = Arc::new(FakeGitHubGateway::default());
        let use_cases = use_cases_with_gateway(
            WorkspaceRole::Editor,
            Arc::clone(&repository),
            Arc::clone(&gateway),
        );

        assert!(
            use_cases
                .link_pull_request(
                    Uuid::new_v4(),
                    workspace_id,
                    block_id,
                    LinkGitHubPullRequestInput {
                        url: "https://github.com/acme/reason/pull/42".into(),
                    },
                )
                .await
                .is_err()
        );
        assert_eq!(gateway.pull_request_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn file_limit_is_reported_even_when_the_saved_count_is_stale() {
        let workspace_id = Uuid::new_v4();
        let block_id = Uuid::new_v4();
        let repository = Arc::new(FakeGitHubRepository::default());
        *repository.installation.lock().unwrap() = Some(fake_installation(workspace_id, 123));
        repository
            .links
            .lock()
            .unwrap()
            .push(fake_link(workspace_id, block_id));
        let gateway = Arc::new(FakeGitHubGateway {
            file_limit_reached: true,
            ..FakeGitHubGateway::default()
        });
        let use_cases =
            use_cases_with_gateway(WorkspaceRole::Viewer, repository, Arc::clone(&gateway));

        let response = use_cases
            .list_pull_request_files(Uuid::new_v4(), workspace_id, block_id)
            .await
            .unwrap();

        assert!(response.truncated);
        assert_eq!(response.total_changed_files, 2);
    }

    #[tokio::test]
    async fn missing_or_other_workspace_link_is_not_found_without_calling_github() {
        let workspace_id = Uuid::new_v4();
        let block_id = Uuid::new_v4();
        let repository = Arc::new(FakeGitHubRepository::default());
        *repository.installation.lock().unwrap() = Some(fake_installation(workspace_id, 123));
        repository
            .links
            .lock()
            .unwrap()
            .push(fake_link(Uuid::new_v4(), block_id));
        let gateway = Arc::new(FakeGitHubGateway::default());
        let use_cases =
            use_cases_with_gateway(WorkspaceRole::Viewer, repository, Arc::clone(&gateway));

        assert_eq!(
            use_cases
                .list_pull_request_files(Uuid::new_v4(), workspace_id, block_id)
                .await
                .unwrap_err(),
            AppError::GitHubPullRequestNotFound
        );
        assert_eq!(gateway.file_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn non_member_is_forbidden_before_the_link_is_queried() {
        let repository = Arc::new(FakeGitHubRepository::default());
        let use_cases = GitHubUseCases::new(
            repository.clone(),
            Some(Arc::new(FakeGitHubGateway::default())),
            Arc::new(FakeWorkspaceRepository { role: None }),
            Arc::new(FixedClock::new(now())),
        );

        assert_eq!(
            use_cases
                .list_pull_request_files(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4())
                .await
                .unwrap_err(),
            AppError::Forbidden
        );
        assert_eq!(repository.find_link_calls.load(Ordering::SeqCst), 0);
    }

    fn fake_installation(workspace_id: Uuid, installation_id: i64) -> GitHubInstallation {
        GitHubInstallation {
            id: Uuid::new_v4(),
            workspace_id,
            installation_id,
            account_login: "acme".into(),
            account_type: "Organization".into(),
            created_at: now(),
            updated_at: now(),
        }
    }

    fn fake_link(workspace_id: Uuid, block_id: Uuid) -> GitHubPullRequestLink {
        GitHubPullRequestLink {
            id: Uuid::new_v4(),
            workspace_id,
            block_id,
            owner: "acme".into(),
            repository: "reason".into(),
            pull_number: 42,
            url: "https://github.com/acme/reason/pull/42".into(),
            title: "Review files".into(),
            body: None,
            state: "open".into(),
            draft: false,
            author_login: Some("octocat".into()),
            head_sha: "abc123".into(),
            base_ref: "main".into(),
            head_ref: "feature/review".into(),
            additions: 8,
            deletions: 2,
            changed_files: 1,
            created_at: now(),
            updated_at: now(),
        }
    }
}
