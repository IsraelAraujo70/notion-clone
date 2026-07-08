use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::domain::error::DomainError;
use crate::domain::workspace::WorkspaceMembership;

pub async fn require_member(
    workspace_repository: &Arc<dyn WorkspaceRepository>,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<WorkspaceMembership, AppError> {
    workspace_repository
        .find_membership(workspace_id, user_id)
        .await?
        .ok_or(AppError::Forbidden)
}

pub async fn require_owner(
    workspace_repository: &Arc<dyn WorkspaceRepository>,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<WorkspaceMembership, AppError> {
    let membership = require_member(workspace_repository, workspace_id, user_id).await?;
    if membership.role.can_manage_workspace() {
        Ok(membership)
    } else {
        Err(AppError::Forbidden)
    }
}

/// Escrita de conteúdo: owner e editor. Viewer lê e nada mais.
pub async fn require_writer(
    workspace_repository: &Arc<dyn WorkspaceRepository>,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<WorkspaceMembership, AppError> {
    let membership = require_member(workspace_repository, workspace_id, user_id).await?;
    if membership.role.can_write_content() {
        Ok(membership)
    } else {
        Err(AppError::Forbidden)
    }
}

pub fn member_not_found() -> AppError {
    DomainError::Validation("Workspace member was not found").into()
}

pub fn last_owner_error() -> AppError {
    DomainError::Validation("Workspace must keep at least one owner").into()
}
