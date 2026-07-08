use std::sync::Arc;

use chrono::Duration;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::email::{EmailSender, WorkspaceInviteEmail};
use crate::application::ports::workspace::{CreateWorkspaceInviteRecord, WorkspaceRepository};
use crate::application::workspaces::permissions::require_owner;
use crate::domain::auth::{generate_token, hash_token, validate_email};
use crate::domain::error::DomainError;
use crate::domain::workspace::{WorkspaceInvite, validate_workspace_role};

pub const WORKSPACE_INVITE_TTL_DAYS: i64 = 7;

#[derive(Debug, Clone)]
pub struct InviteMemberInput {
    pub actor_id: Uuid,
    pub actor_display_name: String,
    pub workspace_id: Uuid,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Clone)]
pub struct InviteMemberOutput {
    pub invite: WorkspaceInvite,
    pub token: String,
}

#[derive(Clone)]
pub struct InviteMemberUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
    email_sender: Arc<dyn EmailSender>,
    clock: Arc<dyn Clock>,
    public_web_url: String,
}

impl InviteMemberUseCase {
    pub fn new(
        workspace_repository: Arc<dyn WorkspaceRepository>,
        email_sender: Arc<dyn EmailSender>,
        clock: Arc<dyn Clock>,
        public_web_url: String,
    ) -> Self {
        Self {
            workspace_repository,
            email_sender,
            clock,
            public_web_url: public_web_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn execute(&self, input: InviteMemberInput) -> Result<InviteMemberOutput, AppError> {
        let membership = require_owner(
            &self.workspace_repository,
            input.workspace_id,
            input.actor_id,
        )
        .await?;
        let email = input.email.trim().to_lowercase();
        validate_email(&email)?;
        let role = validate_workspace_role(&input.role)?;

        if self
            .workspace_repository
            .find_member_by_email(input.workspace_id, &email)
            .await?
            .is_some()
        {
            return Err(AppError::AlreadyMember);
        }

        let now = self.clock.now();
        self.workspace_repository
            .revoke_open_invite(input.workspace_id, &email, now)
            .await?;

        let token = generate_token();
        let expires_at = now + Duration::days(WORKSPACE_INVITE_TTL_DAYS);
        let invite = self
            .workspace_repository
            .create_invite(CreateWorkspaceInviteRecord {
                workspace_id: input.workspace_id,
                email: email.clone(),
                role,
                token_hash: hash_token(&token),
                invited_by: input.actor_id,
                expires_at,
            })
            .await?;

        let invite_url = format!("{}/invite?token={token}", self.public_web_url);
        self.email_sender
            .send_workspace_invite(WorkspaceInviteEmail {
                to: email,
                inviter_display_name: input.actor_display_name,
                workspace_name: membership.name,
                role: role.as_str().to_string(),
                invite_url,
                expires_at,
            })
            .await?;

        if invite.revoked_at.is_some() || invite.accepted_at.is_some() {
            return Err(DomainError::Validation("Invite was not created").into());
        }

        Ok(InviteMemberOutput { invite, token })
    }
}
