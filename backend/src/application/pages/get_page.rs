use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::page::{PageRepository, PageView};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;

#[derive(Clone)]
pub struct GetPageUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl GetPageUseCase {
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
        page_id: Uuid,
    ) -> Result<PageView, AppError> {
        require_member(&self.workspace_repository, workspace_id, user_id).await?;
        self.page_repository
            .get_page(workspace_id, page_id)
            .await
            .map_err(Into::into)
    }
}
