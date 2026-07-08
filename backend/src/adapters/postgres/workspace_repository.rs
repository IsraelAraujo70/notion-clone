use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::workspace::{CreateWorkspaceInviteRecord, WorkspaceRepository};
use crate::domain::workspace::{
    Workspace, WorkspaceInvite, WorkspaceInvitePreview, WorkspaceInviteStatus, WorkspaceMember,
    WorkspaceMembership, WorkspaceRole, validate_workspace_role,
};

#[derive(Debug, Clone)]
pub struct PostgresWorkspaceRepository {
    pool: PgPool,
}

impl PostgresWorkspaceRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceRow {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceRow> for Workspace {
    fn from(row: WorkspaceRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceMembershipRow {
    id: Uuid,
    name: String,
    role: String,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceMembershipRow> for WorkspaceMembership {
    fn from(row: WorkspaceMembershipRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            role: validate_workspace_role(&row.role).expect("database workspace role is valid"),
            created_at: row.created_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceMemberRow {
    user_id: Uuid,
    email: String,
    display_name: String,
    role: String,
    joined_at: DateTime<Utc>,
}

impl From<WorkspaceMemberRow> for WorkspaceMember {
    fn from(row: WorkspaceMemberRow) -> Self {
        Self {
            user_id: row.user_id,
            email: row.email,
            display_name: row.display_name,
            role: validate_workspace_role(&row.role).expect("database workspace role is valid"),
            joined_at: row.joined_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceInviteRow {
    id: Uuid,
    workspace_id: Uuid,
    email: String,
    role: String,
    invited_by: Uuid,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    accepted_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
}

impl From<WorkspaceInviteRow> for WorkspaceInvite {
    fn from(row: WorkspaceInviteRow) -> Self {
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            email: row.email,
            role: validate_workspace_role(&row.role).expect("database workspace role is valid"),
            invited_by: row.invited_by,
            created_at: row.created_at,
            expires_at: row.expires_at,
            accepted_at: row.accepted_at,
            revoked_at: row.revoked_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct WorkspaceInvitePreviewRow {
    workspace_name: String,
    email: String,
    role: String,
    expires_at: DateTime<Utc>,
    accepted_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
}

impl WorkspaceInvitePreviewRow {
    fn into_preview(self, now: DateTime<Utc>) -> WorkspaceInvitePreview {
        let status = if self.accepted_at.is_some() {
            WorkspaceInviteStatus::Accepted
        } else if self.revoked_at.is_some() {
            WorkspaceInviteStatus::Revoked
        } else if self.expires_at <= now {
            WorkspaceInviteStatus::Expired
        } else {
            WorkspaceInviteStatus::Pending
        };

        WorkspaceInvitePreview {
            workspace_name: self.workspace_name,
            email: self.email,
            role: validate_workspace_role(&self.role).expect("database workspace role is valid"),
            expires_at: self.expires_at,
            status,
        }
    }
}

#[async_trait]
impl WorkspaceRepository for PostgresWorkspaceRepository {
    async fn list_for_user(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<WorkspaceMembership>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceMembershipRow>(
            "SELECT w.id, w.name, wm.role, w.created_at
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.user_id = $1
             ORDER BY w.created_at ASC, w.id ASC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn create_for_owner(
        &self,
        owner_id: Uuid,
        name: String,
    ) -> Result<Workspace, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let workspace = sqlx::query_as::<_, WorkspaceRow>(
            "WITH workspace AS (
                 INSERT INTO workspaces (name, created_by)
                 VALUES ($1, $2)
                 RETURNING id, name, created_at
             ), membership AS (
                 INSERT INTO workspace_members (workspace_id, user_id, role)
                 SELECT id, $2, 'owner' FROM workspace
             )
             SELECT id, name, created_at FROM workspace",
        )
        .bind(name)
        .bind(owner_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(workspace.into())
    }

    async fn find_membership(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<WorkspaceMembership>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceMembershipRow>(
            "SELECT w.id, w.name, wm.role, w.created_at
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.workspace_id = $1 AND wm.user_id = $2",
        )
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(Into::into))
        .map_err(map_sqlx_error)
    }

    async fn list_members(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<WorkspaceMember>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceMemberRow>(
            "SELECT u.id AS user_id, u.email, u.display_name, wm.role, wm.created_at AS joined_at
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             WHERE wm.workspace_id = $1
             ORDER BY wm.created_at ASC, u.email ASC",
        )
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn find_member_by_email(
        &self,
        workspace_id: Uuid,
        email: &str,
    ) -> Result<Option<WorkspaceMember>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceMemberRow>(
            "SELECT u.id AS user_id, u.email, u.display_name, wm.role, wm.created_at AS joined_at
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             WHERE wm.workspace_id = $1 AND lower(u.email) = lower($2)",
        )
        .bind(workspace_id)
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(Into::into))
        .map_err(map_sqlx_error)
    }

    async fn count_owners(&self, workspace_id: Uuid) -> Result<i64, RepositoryError> {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'",
        )
        .bind(workspace_id)
        .fetch_one(&self.pool)
        .await
        .map(|row| row.0)
        .map_err(map_sqlx_error)
    }

    async fn list_pending_invites(
        &self,
        workspace_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<Vec<WorkspaceInvite>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceInviteRow>(
            "SELECT id, workspace_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at
             FROM workspace_invites
             WHERE workspace_id = $1
               AND accepted_at IS NULL
               AND revoked_at IS NULL
               AND expires_at > $2
             ORDER BY created_at DESC, id DESC",
        )
        .bind(workspace_id)
        .bind(now)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn revoke_open_invite(
        &self,
        workspace_id: Uuid,
        email: &str,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE workspace_invites
             SET revoked_at = $1
             WHERE workspace_id = $2
               AND lower(email) = lower($3)
               AND accepted_at IS NULL
               AND revoked_at IS NULL",
        )
        .bind(revoked_at)
        .bind(workspace_id)
        .bind(email)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(map_sqlx_error)
    }

    async fn revoke_invite(
        &self,
        workspace_id: Uuid,
        invite_id: Uuid,
        revoked_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE workspace_invites
             SET revoked_at = $1
             WHERE workspace_id = $2
               AND id = $3
               AND accepted_at IS NULL
               AND revoked_at IS NULL",
        )
        .bind(revoked_at)
        .bind(workspace_id)
        .bind(invite_id)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(map_sqlx_error)
    }

    async fn create_invite(
        &self,
        input: CreateWorkspaceInviteRecord,
    ) -> Result<WorkspaceInvite, RepositoryError> {
        sqlx::query_as::<_, WorkspaceInviteRow>(
            "INSERT INTO workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, workspace_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at",
        )
        .bind(input.workspace_id)
        .bind(input.email)
        .bind(input.role.as_str())
        .bind(input.token_hash)
        .bind(input.invited_by)
        .bind(input.expires_at)
        .fetch_one(&self.pool)
        .await
        .map(Into::into)
        .map_err(map_sqlx_error)
    }

    async fn find_invite_preview_by_token_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<WorkspaceInvitePreview>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceInvitePreviewRow>(
            "SELECT w.name AS workspace_name, wi.email, wi.role, wi.expires_at, wi.accepted_at, wi.revoked_at
             FROM workspace_invites wi
             JOIN workspaces w ON w.id = wi.workspace_id
             WHERE wi.token_hash = $1",
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(|row| row.into_preview(now)))
        .map_err(map_sqlx_error)
    }

    async fn find_invite_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<WorkspaceInvite>, RepositoryError> {
        sqlx::query_as::<_, WorkspaceInviteRow>(
            "SELECT id, workspace_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at
             FROM workspace_invites
             WHERE token_hash = $1",
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await
        .map(|row| row.map(Into::into))
        .map_err(map_sqlx_error)
    }

    async fn accept_invite(
        &self,
        invite_id: Uuid,
        user_id: Uuid,
        accepted_at: DateTime<Utc>,
    ) -> Result<WorkspaceMembership, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let invite = sqlx::query_as::<_, WorkspaceInviteRow>(
            "SELECT id, workspace_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at
             FROM workspace_invites
             WHERE id = $1
             FOR UPDATE",
        )
        .bind(invite_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or(RepositoryError::NotFound)?;

        sqlx::query(
            "INSERT INTO workspace_members (workspace_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id, user_id) DO NOTHING",
        )
        .bind(invite.workspace_id)
        .bind(user_id)
        .bind(&invite.role)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        sqlx::query(
            "UPDATE workspace_invites
             SET accepted_at = $1, accepted_by = $2
             WHERE id = $3 AND accepted_at IS NULL",
        )
        .bind(accepted_at)
        .bind(user_id)
        .bind(invite_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let membership = sqlx::query_as::<_, WorkspaceMembershipRow>(
            "SELECT w.id, w.name, wm.role, w.created_at
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.workspace_id = $1 AND wm.user_id = $2",
        )
        .bind(invite.workspace_id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(membership.into())
    }

    async fn update_member_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: WorkspaceRole,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3",
        )
        .bind(role.as_str())
        .bind(workspace_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(map_sqlx_error)
    }

    async fn remove_member(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), RepositoryError> {
        sqlx::query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2")
            .bind(workspace_id)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(map_sqlx_error)
    }
}
