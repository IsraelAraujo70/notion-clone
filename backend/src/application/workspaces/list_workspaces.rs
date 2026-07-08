use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::domain::workspace::WorkspaceMembership;

#[derive(Clone)]
pub struct ListWorkspacesUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl ListWorkspacesUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>) -> Self {
        Self {
            workspace_repository,
        }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<Vec<WorkspaceMembership>, AppError> {
        self.workspace_repository
            .list_for_user(user_id)
            .await
            .map_err(Into::into)
    }
}
