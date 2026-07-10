use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::block::{Block, BlockType, Operation};

#[derive(Debug, Clone, Serialize)]
pub struct LoggedOperation {
    pub seq: i64,
    pub op_id: Uuid,
    pub actor_id: Uuid,
    pub operation: Operation,
}

#[derive(Debug, Clone, Serialize)]
pub struct OperationsPage {
    pub operations: Vec<LoggedOperation>,
    pub latest_seq: i64,
}

/// Subárvore de uma página. Páginas filhas entram como bloco (link), sem os filhos delas.
#[derive(Debug, Clone, Serialize)]
pub struct PageTree {
    #[serde(rename = "rootId")]
    pub root_id: Uuid,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageSummary {
    pub id: Uuid,
    pub title: String,
    /// Emoji escolhido como ícone da página (`properties.icon`), vazio se não houver.
    pub icon: String,
    pub parent_page_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Breadcrumb {
    pub id: Uuid,
    pub title: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrashEntry {
    pub id: Uuid,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub title: String,
    pub trashed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct OperationAck {
    pub op_id: Uuid,
    pub seq: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageEditor {
    pub user_id: Uuid,
    pub display_name: String,
    #[serde(skip_serializing)]
    pub avatar_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub last_edited_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageView {
    pub page: PageTree,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub seq: i64,
    #[serde(default)]
    pub recent_editors: Vec<PageEditor>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageList {
    pub root_page_id: Uuid,
    pub pages: Vec<PageSummary>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SearchResult {
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub page_id: Uuid,
    pub page_title: String,
    pub page_icon: String,
    pub block_id: Uuid,
    pub block_type: BlockType,
    pub snippet: String,
    pub rank: f32,
}

#[derive(Debug, Clone)]
pub struct PublicLink {
    pub token: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PermanentDeleteResult {
    pub deleted_blocks: u64,
    pub media_cleanup_queued: u64,
}

#[async_trait]
pub trait PageRepository: Send + Sync {
    async fn list_pages(&self, workspace_id: Uuid) -> Result<PageList, RepositoryError>;

    async fn get_page(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<PageView, RepositoryError>;

    async fn list_trash(&self, workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError>;

    /// Serializa a escrita no workspace, é idempotente por `op_id` e devolve o `seq` atribuído.
    async fn apply_operation(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operation: &Operation,
        now: DateTime<Utc>,
    ) -> Result<OperationAck, RepositoryError>;

    /// Catch-up: ops com `after_seq < seq <= up_to_seq`, ordenadas e paginadas.
    /// Quando `up_to_seq` não é informado, o repositório captura o cursor atual
    /// do workspace e o devolve em `latest_seq` como limite estável da página.
    async fn list_operations_after(
        &self,
        workspace_id: Uuid,
        after_seq: i64,
        limit: Option<i64>,
        up_to_seq: Option<i64>,
    ) -> Result<OperationsPage, RepositoryError>;

    async fn search(
        &self,
        _user_id: Uuid,
        _query: &str,
        _limit: i64,
    ) -> Result<Vec<SearchResult>, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn get_public_link(
        &self,
        _workspace_id: Uuid,
        _page_id: Uuid,
    ) -> Result<Option<PublicLink>, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn create_public_link(
        &self,
        _workspace_id: Uuid,
        _page_id: Uuid,
        _created_by: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<PublicLink, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn revoke_public_link(
        &self,
        _workspace_id: Uuid,
        _page_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn get_public_page(&self, _token: Uuid) -> Result<PageTree, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn permanently_delete(
        &self,
        _workspace_id: Uuid,
        _block_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<PermanentDeleteResult, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }
}
