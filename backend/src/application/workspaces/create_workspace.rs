use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::domain::workspace::{Workspace, validate_workspace_name};

#[derive(Debug, Clone)]
pub struct CreateWorkspaceInput {
    pub owner_id: Uuid,
    pub name: String,
}

#[derive(Clone)]
pub struct CreateWorkspaceUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl CreateWorkspaceUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>) -> Self {
        Self {
            workspace_repository,
        }
    }

    pub async fn execute(&self, input: CreateWorkspaceInput) -> Result<Workspace, AppError> {
        let name = validate_workspace_name(&input.name)?;
        self.workspace_repository
            .create_for_owner(input.owner_id, name)
            .await
            .map_err(Into::into)
    }
}
