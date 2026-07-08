use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::{
    last_owner_error, member_not_found, require_owner,
};
use crate::domain::workspace::{WorkspaceRole, validate_workspace_role};

#[derive(Clone)]
pub struct UpdateMemberRoleUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl UpdateMemberRoleUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>) -> Self {
        Self {
            workspace_repository,
        }
    }

    pub async fn execute(
        &self,
        actor_id: Uuid,
        workspace_id: Uuid,
        member_user_id: Uuid,
        role: String,
    ) -> Result<(), AppError> {
        require_owner(&self.workspace_repository, workspace_id, actor_id).await?;
        let next_role = validate_workspace_role(&role)?;
        let current = self
            .workspace_repository
            .find_membership(workspace_id, member_user_id)
            .await?
            .ok_or_else(member_not_found)?;

        if current.role == WorkspaceRole::Owner && next_role != WorkspaceRole::Owner {
            let owner_count = self.workspace_repository.count_owners(workspace_id).await?;
            if owner_count <= 1 {
                return Err(last_owner_error());
            }
        }

        self.workspace_repository
            .update_member_role(workspace_id, member_user_id, next_role)
            .await
            .map_err(Into::into)
    }
}
