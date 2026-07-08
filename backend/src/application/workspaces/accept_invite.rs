use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::domain::auth::hash_token;
use crate::domain::error::DomainError;
use crate::domain::workspace::{
    WorkspaceInvitePreview, WorkspaceInviteStatus, WorkspaceMembership,
};

#[derive(Debug, Clone)]
pub struct AcceptInviteInput {
    pub token: String,
    pub user_id: Uuid,
    pub user_email: String,
}

#[derive(Clone)]
pub struct AcceptInviteUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl AcceptInviteUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>, clock: Arc<dyn Clock>) -> Self {
        Self {
            workspace_repository,
            clock,
        }
    }

    pub async fn preview(&self, token: &str) -> Result<WorkspaceInvitePreview, AppError> {
        let token = token.trim();
        if token.is_empty() {
            return Err(DomainError::Validation("Invite token is required").into());
        }

        self.workspace_repository
            .find_invite_preview_by_token_hash(&hash_token(token), self.clock.now())
            .await?
            .ok_or_else(|| DomainError::Validation("Invite link is invalid").into())
    }

    pub async fn execute(&self, input: AcceptInviteInput) -> Result<WorkspaceMembership, AppError> {
        let token = input.token.trim();
        if token.is_empty() {
            return Err(DomainError::Validation("Invite token is required").into());
        }

        let now = self.clock.now();
        let invite = self
            .workspace_repository
            .find_invite_by_token_hash(&hash_token(token))
            .await?
            .ok_or_else(|| AppError::Domain(DomainError::Validation("Invite link is invalid")))?;

        if let Some(existing) = self
            .workspace_repository
            .find_membership(invite.workspace_id, input.user_id)
            .await?
        {
            return Ok(existing);
        }

        if invite.email != input.user_email.trim().to_lowercase() {
            return Err(AppError::Forbidden);
        }
        if invite.accepted_at.is_some() {
            return Err(DomainError::Validation("Invite link was already accepted").into());
        }
        if invite.revoked_at.is_some() {
            return Err(DomainError::Validation("Invite link was revoked").into());
        }
        if invite.expires_at <= now {
            return Err(DomainError::Validation("Invite link is expired").into());
        }

        self.workspace_repository
            .accept_invite(invite.id, input.user_id, now)
            .await
            .map_err(Into::into)
    }
}

impl WorkspaceInvitePreview {
    pub fn is_pending(&self) -> bool {
        self.status == WorkspaceInviteStatus::Pending
    }
}
