use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::workspace::{
    Workspace, WorkspaceInvite, WorkspaceInvitePreview, WorkspaceMember, WorkspaceMembership,
    WorkspaceRole,
};

#[derive(Debug, Clone)]
pub struct CreateWorkspaceInviteRecord {
    pub workspace_id: Uuid,
    pub email: String,
    pub role: WorkspaceRole,
    pub token_hash: String,
    pub invited_by: Uuid,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait WorkspaceRepository: Send + Sync {
    async fn list_for_user(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<WorkspaceMembership>, RepositoryError>;

    async fn create_for_owner(
        &self,
        owner_id: Uuid,
        name: String,
    ) -> Result<Workspace, RepositoryError>;

    async fn find_membership(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<WorkspaceMembership>, RepositoryError>;

    async fn list_members(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<WorkspaceMember>, RepositoryError>;

    async fn find_member_by_email(
        &self,
        workspace_id: Uuid,
        email: &str,
    ) -> Result<Option<WorkspaceMember>, RepositoryError>;

    async fn count_owners(&self, workspace_id: Uuid) -> Result<i64, RepositoryError>;

    async fn list_pending_invites(
        &self,
        workspace_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<Vec<WorkspaceInvite>, RepositoryError>;

    async fn revoke_open_invite(
        &self,
        workspace_id: Uuid,
        email: &str,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;

    async fn revoke_invite(
        &self,
        workspace_id: Uuid,
        invite_id: Uuid,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;

    async fn create_invite(
        &self,
        input: CreateWorkspaceInviteRecord,
    ) -> Result<WorkspaceInvite, RepositoryError>;

    async fn find_invite_preview_by_token_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<WorkspaceInvitePreview>, RepositoryError>;

    async fn find_invite_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<WorkspaceInvite>, RepositoryError>;

    async fn accept_invite(
        &self,
        invite_id: Uuid,
        user_id: Uuid,
        accepted_at: DateTime<Utc>,
    ) -> Result<WorkspaceMembership, RepositoryError>;

    async fn update_member_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: WorkspaceRole,
    ) -> Result<(), RepositoryError>;

    async fn remove_member(&self, workspace_id: Uuid, user_id: Uuid)
    -> Result<(), RepositoryError>;

    async fn delete_workspace(&self, workspace_id: Uuid) -> Result<(), RepositoryError>;
}
