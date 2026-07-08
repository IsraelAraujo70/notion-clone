use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::block::{Block, BlockType, Operation};

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
    pub parent_page_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Breadcrumb {
    pub id: Uuid,
    pub title: String,
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
pub struct PageView {
    pub page: PageTree,
    pub breadcrumbs: Vec<Breadcrumb>,
    pub seq: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageList {
    pub root_page_id: Uuid,
    pub pages: Vec<PageSummary>,
}

#[async_trait]
pub trait PageRepository: Send + Sync {
    async fn list_pages(&self, workspace_id: Uuid) -> Result<PageList, RepositoryError>;

    async fn get_page(&self, workspace_id: Uuid, page_id: Uuid)
    -> Result<PageView, RepositoryError>;

    async fn list_trash(&self, workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError>;

    /// Serializa a escrita no workspace, é idempotente por `op_id` e devolve o `seq` atribuído.
    async fn apply_operation(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operation: &Operation,
        now: DateTime<Utc>,
    ) -> Result<OperationAck, RepositoryError>;
}
