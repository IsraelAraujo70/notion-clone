use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::page::{OperationsPage, PageRepository};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;

#[derive(Clone)]
pub struct ListOperationsUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl ListOperationsUseCase {
    pub fn new(
        page_repository: Arc<dyn PageRepository>,
        workspace_repository: Arc<dyn WorkspaceRepository>,
    ) -> Self {
        Self {
            page_repository,
            workspace_repository,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        after_seq: i64,
        limit: Option<i64>,
        up_to_seq: Option<i64>,
    ) -> Result<OperationsPage, AppError> {
        require_member(&self.workspace_repository, workspace_id, user_id).await?;
        self.page_repository
            .list_operations_after(workspace_id, after_seq, limit, up_to_seq)
            .await
            .map_err(Into::into)
    }
}
