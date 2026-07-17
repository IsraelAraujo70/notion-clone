use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::block::{Block, BlockType, Operation};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OperationGroup {
    pub id: Uuid,
    pub source: String,
    #[serde(default)]
    pub provenance: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OperationGroupMetadata {
    pub group_id: Uuid,
    pub group_ordinal: i32,
    pub source: String,
    pub initiated_by: Uuid,
    #[serde(default, skip_serializing_if = "serde_json::Value::is_null")]
    pub provenance: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoggedOperation {
    pub seq: i64,
    pub op_id: Uuid,
    pub actor_id: Uuid,
    pub operation: Operation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<OperationGroupMetadata>,
}

#[derive(Debug, Clone)]
pub struct AppliedOperation {
    pub envelope: LoggedOperation,
    pub inserted: bool,
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
    pub page_id: Option<Uuid>,
    pub page_title: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct OperationAck {
    pub op_id: Uuid,
    pub seq: i64,
}

#[derive(Debug, Clone)]
pub struct TransferSubtreeResult {
    pub source: AppliedOperation,
    pub destination: AppliedOperation,
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

    async fn get_page_for_block(
        &self,
        _workspace_id: Uuid,
        _block_id: Uuid,
    ) -> Result<PageView, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }

    async fn list_trash(&self, workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError>;

    /// Serializa a escrita no workspace, é idempotente por `op_id` e devolve o `seq` atribuído.
    async fn apply_operation(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operation: &Operation,
        now: DateTime<Utc>,
    ) -> Result<OperationAck, RepositoryError>;

    async fn apply_operation_batch(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operations: &[Operation],
        _group: Option<&OperationGroup>,
        now: DateTime<Utc>,
    ) -> Result<Vec<AppliedOperation>, RepositoryError> {
        let mut applied = Vec::with_capacity(operations.len());
        for operation in operations {
            let ack = self
                .apply_operation(workspace_id, actor_id, operation, now)
                .await?;
            applied.push(AppliedOperation {
                envelope: LoggedOperation {
                    seq: ack.seq,
                    op_id: ack.op_id,
                    actor_id,
                    operation: operation.clone(),
                    group: None,
                },
                inserted: true,
            });
        }
        Ok(applied)
    }

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

    async fn transfer_subtree(
        &self,
        _source_workspace_id: Uuid,
        _destination_workspace_id: Uuid,
        _block_id: Uuid,
        _transfer_id: Uuid,
        _actor_id: Uuid,
        _now: DateTime<Utc>,
    ) -> Result<TransferSubtreeResult, RepositoryError> {
        Err(RepositoryError::Unexpected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn operation_group_metadata_extends_the_envelope_not_the_operation() {
        let actor = Uuid::new_v4();
        let group_id = Uuid::new_v4();
        let logged = LoggedOperation {
            seq: 7,
            op_id: Uuid::new_v4(),
            actor_id: actor,
            operation: Operation::DeleteBlock {
                op_id: Uuid::new_v4(),
                block_id: Uuid::new_v4(),
            },
            group: Some(OperationGroupMetadata {
                group_id,
                group_ordinal: 2,
                source: "ai".into(),
                initiated_by: actor,
                provenance: json!({"runId":"run"}),
            }),
        };
        let value = serde_json::to_value(logged).unwrap();
        assert_eq!(value["group"]["group_id"], json!(group_id));
        assert_eq!(value["group"]["group_ordinal"], 2);
        assert_eq!(value["operation"]["type"], "delete_block");
        assert!(value["operation"].get("group_id").is_none());
    }

    #[test]
    fn trash_entry_serializes_its_nearest_page_context() {
        let page_id = Uuid::new_v4();
        let entry = TrashEntry {
            id: Uuid::new_v4(),
            block_type: BlockType::Paragraph,
            title: "Draft".into(),
            trashed_at: "2026-07-10T12:00:00Z".parse().unwrap(),
            page_id: Some(page_id),
            page_title: Some("Project notes".into()),
        };

        let value = serde_json::to_value(entry).unwrap();
        assert_eq!(value["type"], "paragraph");
        assert_eq!(value["page_id"], json!(page_id));
        assert_eq!(value["page_title"], "Project notes");
    }
}
