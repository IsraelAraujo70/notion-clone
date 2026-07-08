use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::page::{PageList, PageRepository};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;

#[derive(Clone)]
pub struct ListPagesUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl ListPagesUseCase {
    pub fn new(
        page_repository: Arc<dyn PageRepository>,
        workspace_repository: Arc<dyn WorkspaceRepository>,
    ) -> Self {
        Self {
            page_repository,
            workspace_repository,
        }
    }

    pub async fn execute(&self, user_id: Uuid, workspace_id: Uuid) -> Result<PageList, AppError> {
        require_member(&self.workspace_repository, workspace_id, user_id).await?;
        self.page_repository
            .list_pages(workspace_id)
            .await
            .map_err(Into::into)
    }
}
