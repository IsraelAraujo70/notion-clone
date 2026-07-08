use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;
use crate::domain::workspace::WorkspaceMember;

#[derive(Clone)]
pub struct ListMembersUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl ListMembersUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>) -> Self {
        Self {
            workspace_repository,
        }
    }

    pub async fn execute(
        &self,
        actor_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Vec<WorkspaceMember>, AppError> {
        require_member(&self.workspace_repository, workspace_id, actor_id).await?;
        self.workspace_repository
            .list_members(workspace_id)
            .await
            .map_err(Into::into)
    }
}
