use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::page::{DirectChildrenPage, DirectChildrenQuery, PageRepository};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;

#[derive(Clone)]
pub struct QueryBlocksUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl QueryBlocksUseCase {
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
        query: DirectChildrenQuery,
    ) -> Result<DirectChildrenPage, AppError> {
        require_member(&self.workspace_repository, workspace_id, user_id).await?;
        self.page_repository
            .query_direct_children(workspace_id, query)
            .await
            .map_err(Into::into)
    }
}
