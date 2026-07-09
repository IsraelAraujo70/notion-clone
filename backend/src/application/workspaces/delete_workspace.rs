use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_owner;

#[derive(Clone)]
pub struct DeleteWorkspaceUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl DeleteWorkspaceUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>) -> Self {
        Self {
            workspace_repository,
        }
    }

    pub async fn execute(&self, actor_id: Uuid, workspace_id: Uuid) -> Result<(), AppError> {
        require_owner(&self.workspace_repository, workspace_id, actor_id).await?;
        self.workspace_repository
            .delete_workspace(workspace_id)
            .await
            .map_err(Into::into)
    }
}
