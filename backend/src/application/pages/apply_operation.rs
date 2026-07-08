use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::page::{OperationAck, PageRepository};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_writer;
use crate::domain::block::Operation;

#[derive(Clone)]
pub struct ApplyOperationUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl ApplyOperationUseCase {
    pub fn new(
        page_repository: Arc<dyn PageRepository>,
        workspace_repository: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            page_repository,
            workspace_repository,
            clock,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        operation: Operation,
    ) -> Result<OperationAck, AppError> {
        require_writer(&self.workspace_repository, workspace_id, user_id).await?;
        self.page_repository
            .apply_operation(workspace_id, user_id, &operation, self.clock.now())
            .await
            .map_err(Into::into)
    }
}
