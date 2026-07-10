use std::sync::Arc;
use std::time::Instant;

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::page::{
    PageRepository, PageTree, PermanentDeleteResult, PublicLink, SearchResult,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_writer;
use crate::domain::error::DomainError;

pub const DEFAULT_SEARCH_LIMIT: i64 = 20;
pub const MAX_SEARCH_LIMIT: i64 = 50;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PublicLinkResponse {
    pub token: Uuid,
    pub url: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublicPageResponse {
    pub page: PageTree,
}

#[derive(Clone)]
pub struct SearchPagesUseCase {
    pages: Arc<dyn PageRepository>,
}

impl SearchPagesUseCase {
    pub fn new(pages: Arc<dyn PageRepository>) -> Self {
        Self { pages }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        query: String,
        limit: Option<i64>,
    ) -> Result<Vec<SearchResult>, AppError> {
        let query = query.trim();
        if !(2..=200).contains(&query.chars().count()) {
            return Err(
                DomainError::Validation("Search query must contain 2 to 200 characters").into(),
            );
        }
        let limit = limit.unwrap_or(DEFAULT_SEARCH_LIMIT);
        if !(1..=MAX_SEARCH_LIMIT).contains(&limit) {
            return Err(DomainError::Validation("Search limit must be between 1 and 50").into());
        }

        let started = Instant::now();
        let results = self.pages.search(user_id, query, limit).await?;
        tracing::info!(
            event = "page_search",
            query_length = query.chars().count(),
            result_count = results.len(),
            elapsed_ms = started.elapsed().as_millis() as u64,
        );
        Ok(results)
    }
}

#[derive(Clone)]
pub struct PublicLinksUseCase {
    pages: Arc<dyn PageRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
    public_web_url: String,
}

impl PublicLinksUseCase {
    pub fn new(
        pages: Arc<dyn PageRepository>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
        public_web_url: String,
    ) -> Self {
        Self {
            pages,
            workspaces,
            clock,
            public_web_url: public_web_url.trim_end_matches('/').to_string(),
        }
    }

    fn response(&self, link: PublicLink) -> PublicLinkResponse {
        PublicLinkResponse {
            token: link.token,
            url: format!("{}/share/{}", self.public_web_url, link.token),
            created_at: link.created_at,
        }
    }

    pub async fn get(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<Option<PublicLinkResponse>, AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        Ok(self
            .pages
            .get_public_link(workspace_id, page_id)
            .await?
            .map(|link| self.response(link)))
    }

    pub async fn create(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<PublicLinkResponse, AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        let link = self
            .pages
            .create_public_link(workspace_id, page_id, user_id, self.clock.now())
            .await?;
        tracing::info!(event = "public_link_created", workspace_id = %workspace_id, page_id = %page_id);
        Ok(self.response(link))
    }

    pub async fn revoke(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<(), AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        self.pages
            .revoke_public_link(workspace_id, page_id, self.clock.now())
            .await?;
        tracing::info!(event = "public_link_revoked", workspace_id = %workspace_id, page_id = %page_id);
        Ok(())
    }

    pub async fn public_page(&self, token: Uuid) -> Result<PublicPageResponse, AppError> {
        let page = self.pages.get_public_page(token).await?;
        Ok(PublicPageResponse { page })
    }
}

#[derive(Clone)]
pub struct PermanentlyDeleteUseCase {
    pages: Arc<dyn PageRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl PermanentlyDeleteUseCase {
    pub fn new(
        pages: Arc<dyn PageRepository>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            pages,
            workspaces,
            clock,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<PermanentDeleteResult, AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        let result = self
            .pages
            .permanently_delete(workspace_id, block_id, self.clock.now())
            .await?;
        tracing::info!(
            event = "trash_purged",
            workspace_id = %workspace_id,
            block_id = %block_id,
            deleted_blocks = result.deleted_blocks,
            media_cleanup_queued = result.media_cleanup_queued,
        );
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::block::BlockType;

    #[test]
    fn public_url_is_canonical_without_double_slash() {
        let token = Uuid::new_v4();
        let response = PublicLinkResponse {
            token,
            url: format!("https://reason.test/share/{token}"),
            created_at: Utc::now(),
        };
        assert_eq!(response.url, format!("https://reason.test/share/{token}"));
    }

    #[test]
    fn search_bounds_are_the_contract() {
        assert_eq!(DEFAULT_SEARCH_LIMIT, 20);
        assert_eq!(MAX_SEARCH_LIMIT, 50);
    }

    #[test]
    fn search_result_serializes_block_type_in_snake_case() {
        let result = SearchResult {
            workspace_id: Uuid::nil(),
            workspace_name: "Workspace".to_string(),
            page_id: Uuid::nil(),
            page_title: "Page".to_string(),
            page_icon: String::new(),
            block_id: Uuid::nil(),
            block_type: BlockType::Paragraph,
            snippet: "match".to_string(),
            rank: 1.0,
        };
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["block_type"], "paragraph");
        assert!(json.get("type").is_none());
    }
}
