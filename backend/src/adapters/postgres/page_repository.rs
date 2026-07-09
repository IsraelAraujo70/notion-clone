use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::{Map, Value};
use sqlx::{PgConnection, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::page::{
    Breadcrumb, LoggedOperation, OperationAck, OperationsPage, PageEditor, PageList,
    PageRepository, PageSummary, PageTree, PageView, TrashEntry,
};
use crate::domain::block::{
    Block, BlockTree, BlockType, Operation, apply_operation, parse_block_type,
};
use crate::domain::error::DomainError;

const BLOCK_COLUMNS: &str = "id, workspace_id, type, properties, content, parent_id, trashed_at, trashed_index, prop_versions";

const DEFAULT_OPS_LIMIT: i64 = 500;
const MAX_OPS_LIMIT: i64 = 1000;

#[derive(Debug, Clone)]
pub struct PostgresPageRepository {
    pool: PgPool,
}

impl PostgresPageRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct BlockRow {
    id: Uuid,
    workspace_id: Uuid,
    #[sqlx(rename = "type")]
    block_type: String,
    properties: Value,
    content: Vec<Uuid>,
    parent_id: Option<Uuid>,
    trashed_at: Option<DateTime<Utc>>,
    trashed_index: Option<i32>,
    prop_versions: Value,
}

fn parse_prop_versions(value: Value) -> HashMap<String, i64> {
    match value {
        Value::Object(map) => map
            .into_iter()
            .filter_map(|(key, version)| version.as_i64().map(|n| (key, n)))
            .collect(),
        _ => HashMap::new(),
    }
}

impl TryFrom<BlockRow> for Block {
    type Error = RepositoryError;

    fn try_from(row: BlockRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            workspace_id: row.workspace_id,
            block_type: parse_block_type(&row.block_type)?,
            properties: match row.properties {
                Value::Object(map) => map,
                _ => Map::new(),
            },
            prop_versions: parse_prop_versions(row.prop_versions),
            content: row.content,
            parent_id: row.parent_id,
            trashed_at: row.trashed_at,
            trashed_index: row.trashed_index,
        })
    }
}

#[derive(sqlx::FromRow)]
struct OperationRow {
    seq: i64,
    op_id: Uuid,
    actor_id: Uuid,
    operation: Value,
}

#[derive(sqlx::FromRow)]
struct PageSummaryRow {
    id: Uuid,
    title: String,
    icon: String,
    parent_page_id: Option<Uuid>,
}

#[derive(sqlx::FromRow)]
struct BreadcrumbRow {
    id: Uuid,
    title: String,
    icon: String,
}

#[derive(sqlx::FromRow)]
struct TrashRow {
    id: Uuid,
    #[sqlx(rename = "type")]
    block_type: String,
    title: String,
    trashed_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct RecentEditorRow {
    user_id: Uuid,
    display_name: String,
    avatar_key: Option<String>,
    last_edited_at: DateTime<Utc>,
}

fn page_not_found() -> RepositoryError {
    RepositoryError::Domain(DomainError::PageNotFound)
}

/// Sobe a árvore até a página que contém o bloco (ignora o container se for o pai).
fn resolve_containing_page(tree: &BlockTree, block_id: Uuid) -> Option<Uuid> {
    let mut current = block_id;
    loop {
        let block = tree.blocks.get(&current)?;
        if block.block_type == BlockType::Page {
            return Some(block.id);
        }
        current = block.parent_id?;
    }
}

/// Cria o container do workspace e a primeira página de topo (com um parágrafo
/// em branco). Roda na mesma transação que cria o workspace: nenhum workspace
/// existe sem container. O container nunca é exibido nem navegável.
pub async fn create_workspace_root_page(
    tx: &mut PgConnection,
    workspace_id: Uuid,
    created_by: Uuid,
) -> Result<Uuid, sqlx::Error> {
    let container_id = Uuid::new_v4();
    let page_id = Uuid::new_v4();
    let paragraph_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO blocks (id, workspace_id, type, properties, content, created_by)
         VALUES ($1, $2, 'page', '{}'::jsonb, ARRAY[$3]::uuid[], $4)",
    )
    .bind(container_id)
    .bind(workspace_id)
    .bind(page_id)
    .bind(created_by)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO blocks (id, workspace_id, type, properties, content, parent_id, created_by)
         VALUES ($1, $2, 'page', '{\"title\": \"\"}'::jsonb, ARRAY[$3]::uuid[], $4, $5)",
    )
    .bind(page_id)
    .bind(workspace_id)
    .bind(paragraph_id)
    .bind(container_id)
    .bind(created_by)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO blocks (id, workspace_id, type, properties, parent_id, created_by)
         VALUES ($1, $2, 'paragraph', '{\"text\": \"\"}'::jsonb, $3, $4)",
    )
    .bind(paragraph_id)
    .bind(workspace_id)
    .bind(page_id)
    .bind(created_by)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO workspace_page_roots (workspace_id, root_page_id) VALUES ($1, $2)")
        .bind(workspace_id)
        .bind(container_id)
        .execute(&mut *tx)
        .await?;

    Ok(container_id)
}

fn prop_versions_value(block: &Block) -> Value {
    Value::Object(
        block
            .prop_versions
            .iter()
            .map(|(key, version)| (key.clone(), Value::from(*version)))
            .collect(),
    )
}

async fn insert_block_row(
    tx: &mut Transaction<'_, Postgres>,
    block: &Block,
    created_by: Uuid,
) -> Result<(), RepositoryError> {
    sqlx::query(
        "INSERT INTO blocks (id, workspace_id, type, properties, content, parent_id, created_by, trashed_at, trashed_index, prop_versions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(block.id)
    .bind(block.workspace_id)
    .bind(block.block_type.as_str())
    .bind(Value::Object(block.properties.clone()))
    .bind(&block.content[..])
    .bind(block.parent_id)
    .bind(created_by)
    .bind(block.trashed_at)
    .bind(block.trashed_index)
    .bind(prop_versions_value(block))
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(map_sqlx_error)
}

async fn update_block_row(
    tx: &mut Transaction<'_, Postgres>,
    block: &Block,
) -> Result<(), RepositoryError> {
    let affected = sqlx::query(
        "UPDATE blocks
         SET type = $3,
             properties = $4,
             content = $5,
             parent_id = $6,
             trashed_at = $7,
             trashed_index = $8,
             prop_versions = $9,
             updated_at = now()
         WHERE id = $1 AND workspace_id = $2",
    )
    .bind(block.id)
    .bind(block.workspace_id)
    .bind(block.block_type.as_str())
    .bind(Value::Object(block.properties.clone()))
    .bind(&block.content[..])
    .bind(block.parent_id)
    .bind(block.trashed_at)
    .bind(block.trashed_index)
    .bind(prop_versions_value(block))
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_error)?
    .rows_affected();

    if affected == 0 {
        return Err(RepositoryError::Unexpected);
    }
    Ok(())
}

#[async_trait]
impl PageRepository for PostgresPageRepository {
    async fn list_pages(&self, workspace_id: Uuid) -> Result<PageList, RepositoryError> {
        let root_page_id = sqlx::query_as::<_, (Uuid,)>(
            "SELECT root_page_id FROM workspace_page_roots WHERE workspace_id = $1",
        )
        .bind(workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(page_not_found)?
        .0;

        // Caminha a árvore viva a partir da raiz seguindo a ordem de `content`;
        // `path` (ordinalidade acumulada) reproduz a ordem do editor na sidebar.
        let rows = sqlx::query_as::<_, PageSummaryRow>(
            "WITH RECURSIVE walk AS (
                 SELECT b.id, b.type, b.properties, NULL::uuid AS parent_page_id, ARRAY[]::bigint[] AS path
                 FROM blocks b
                 WHERE b.workspace_id = $1 AND b.id = $2 AND b.trashed_at IS NULL
                 UNION ALL
                 SELECT c.id,
                        c.type,
                        c.properties,
                        CASE WHEN w.type = 'page' THEN w.id ELSE w.parent_page_id END,
                        w.path || child.ord
                 FROM walk w
                 JOIN blocks parent ON parent.id = w.id
                 CROSS JOIN LATERAL unnest(parent.content) WITH ORDINALITY AS child(child_id, ord)
                 JOIN blocks c ON c.id = child.child_id
                 WHERE c.workspace_id = $1 AND c.trashed_at IS NULL
             )
             SELECT id,
                    COALESCE(properties->>'title', '') AS title,
                    COALESCE(properties->>'icon', '') AS icon,
                    -- O container não é uma página: seus filhos são as de topo.
                    NULLIF(parent_page_id, $2) AS parent_page_id
             FROM walk
             WHERE type = 'page' AND id <> $2
             ORDER BY path",
        )
        .bind(workspace_id)
        .bind(root_page_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(PageList {
            root_page_id,
            pages: rows
                .into_iter()
                .map(|row| PageSummary {
                    id: row.id,
                    title: row.title,
                    icon: row.icon,
                    parent_page_id: row.parent_page_id,
                })
                .collect(),
        })
    }

    async fn get_page(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<PageView, RepositoryError> {
        // Blocos e cursor precisam vir do mesmo snapshot. Sem isso, uma escrita
        // entre o fetch da árvore e o SELECT de operation_seq pode devolver
        // conteúdo antigo com cursor novo, tornando a operação irrecuperável.
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        // O container do workspace não é uma página navegável.
        let container_id = sqlx::query_as::<_, (Uuid,)>(
            "SELECT root_page_id FROM workspace_page_roots WHERE workspace_id = $1",
        )
        .bind(workspace_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(page_not_found)?
        .0;
        if container_id == page_id {
            return Err(page_not_found());
        }

        // A subárvore para no bloco de página filha: ela vira um link, não conteúdo inline.
        let query = format!(
            "WITH RECURSIVE subtree AS (
                 SELECT {BLOCK_COLUMNS}, 0 AS depth
                 FROM blocks
                 WHERE workspace_id = $1 AND id = $2 AND type = 'page' AND trashed_at IS NULL
                 UNION ALL
                 SELECT c.id, c.workspace_id, c.type, c.properties, c.content, c.parent_id,
                        c.trashed_at, c.trashed_index, c.prop_versions, s.depth + 1
                 FROM subtree s
                 JOIN blocks c ON c.parent_id = s.id
                 WHERE c.workspace_id = $1
                   AND c.trashed_at IS NULL
                   AND (s.depth = 0 OR s.type <> 'page')
             )
             SELECT {BLOCK_COLUMNS} FROM subtree"
        );
        let rows = sqlx::query_as::<_, BlockRow>(&query)
            .bind(workspace_id)
            .bind(page_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        if rows.is_empty() {
            return Err(page_not_found());
        }

        let mut blocks = rows
            .into_iter()
            .map(Block::try_from)
            .collect::<Result<Vec<_>, _>>()?;

        // Páginas filhas chegam sem filhos: `content` apontaria para blocos fora deste fetch.
        for block in &mut blocks {
            if block.id != page_id && block.block_type == BlockType::Page {
                block.content.clear();
            }
        }

        let breadcrumbs = sqlx::query_as::<_, BreadcrumbRow>(
            "WITH RECURSIVE ancestors AS (
                 SELECT id, type, properties, parent_id, 0 AS depth
                 FROM blocks WHERE workspace_id = $1 AND id = $2
                 UNION ALL
                 SELECT b.id, b.type, b.properties, b.parent_id, a.depth + 1
                 FROM ancestors a
                 JOIN blocks b ON b.id = a.parent_id
                 WHERE b.workspace_id = $1
             )
             SELECT id,
                    COALESCE(properties->>'title', '') AS title,
                    COALESCE(properties->>'icon', '') AS icon
             FROM ancestors
             WHERE type = 'page' AND id <> $3
             ORDER BY depth DESC",
        )
        .bind(workspace_id)
        .bind(page_id)
        .bind(container_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let seq = sqlx::query_as::<_, (i64,)>("SELECT operation_seq FROM workspaces WHERE id = $1")
            .bind(workspace_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            .ok_or(RepositoryError::NotFound)?
            .0;

        let editor_rows = sqlx::query_as::<_, RecentEditorRow>(
            "SELECT e.user_id, u.display_name, u.avatar_key, e.last_edited_at
             FROM page_recent_editors e
             JOIN users u ON u.id = e.user_id
             WHERE e.page_id = $1
             ORDER BY e.last_edited_at DESC
             LIMIT 5",
        )
        .bind(page_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let view = PageView {
            page: PageTree {
                root_id: page_id,
                blocks,
            },
            breadcrumbs: breadcrumbs
                .into_iter()
                .map(|row| Breadcrumb {
                    id: row.id,
                    title: row.title,
                    icon: row.icon,
                })
                .collect(),
            seq,
            recent_editors: editor_rows
                .into_iter()
                .map(|row| PageEditor {
                    user_id: row.user_id,
                    display_name: row.display_name,
                    avatar_key: row.avatar_key,
                    avatar_url: None,
                    last_edited_at: row.last_edited_at,
                })
                .collect(),
        };
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(view)
    }

    async fn list_trash(&self, workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError> {
        // Só as raízes das subárvores no lixo: descendentes voltam junto no restore.
        let rows = sqlx::query_as::<_, TrashRow>(
            "SELECT b.id,
                    b.type,
                    COALESCE(NULLIF(b.properties->>'title', ''), NULLIF(b.properties->>'text', ''), '') AS title,
                    b.trashed_at
             FROM blocks b
             LEFT JOIN blocks p ON p.id = b.parent_id
             WHERE b.workspace_id = $1
               AND b.trashed_at IS NOT NULL
               AND (p.id IS NULL OR p.trashed_at IS NULL)
             ORDER BY b.trashed_at DESC, b.id",
        )
        .bind(workspace_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        rows.into_iter()
            .map(|row| {
                Ok(TrashEntry {
                    id: row.id,
                    block_type: parse_block_type(&row.block_type)?,
                    title: row.title,
                    trashed_at: row.trashed_at,
                })
            })
            .collect()
    }

    async fn apply_operation(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operation: &Operation,
        now: DateTime<Utc>,
    ) -> Result<OperationAck, RepositoryError> {
        let op_id = operation.op_id();
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;

        // Serializa as escritas do workspace: ops estruturais nunca se cruzam.
        sqlx::query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
            .bind(workspace_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            .ok_or(RepositoryError::NotFound)?;

        // Idempotência: replay do mesmo op_id devolve o seq original sem reaplicar.
        if let Some((seq,)) = sqlx::query_as::<_, (i64,)>(
            "SELECT seq FROM operations WHERE workspace_id = $1 AND op_id = $2",
        )
        .bind(workspace_id)
        .bind(op_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(OperationAck { op_id, seq });
        }

        // ponytail: carrega a árvore inteira do workspace. Simples e correto no tamanho
        // atual; o corte natural é carregar só a subárvore da página quando doer.
        let query = format!("SELECT {BLOCK_COLUMNS} FROM blocks WHERE workspace_id = $1");
        let rows = sqlx::query_as::<_, BlockRow>(&query)
            .bind(workspace_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        let mut tree = BlockTree::from_blocks(
            rows.into_iter()
                .map(Block::try_from)
                .collect::<Result<Vec<_>, _>>()?,
        );

        let touched = apply_operation(&mut tree, operation, workspace_id, now)?;
        let inserted_id = match operation {
            Operation::InsertBlock { block, .. } => Some(block.id),
            _ => None,
        };

        for id in &touched {
            let block = tree.blocks.get(id).expect("touched block exists");
            if Some(*id) == inserted_id {
                insert_block_row(&mut tx, block, actor_id).await?;
            } else {
                update_block_row(&mut tx, block).await?;
            }
        }

        let mut page_ids = std::collections::HashSet::new();
        for id in &touched {
            if let Some(page_id) = resolve_containing_page(&tree, *id) {
                page_ids.insert(page_id);
            }
        }
        for page_id in page_ids {
            sqlx::query(
                "INSERT INTO page_recent_editors (page_id, user_id, last_edited_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (page_id, user_id)
                 DO UPDATE SET last_edited_at = EXCLUDED.last_edited_at",
            )
            .bind(page_id)
            .bind(actor_id)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }

        let seq = sqlx::query_as::<_, (i64,)>(
            "UPDATE workspaces SET operation_seq = operation_seq + 1 WHERE id = $1 RETURNING operation_seq",
        )
        .bind(workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;

        sqlx::query(
            "INSERT INTO operations (workspace_id, seq, op_id, actor_id, operation)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(workspace_id)
        .bind(seq)
        .bind(op_id)
        .bind(actor_id)
        .bind(serde_json::to_value(operation).map_err(|_| RepositoryError::Unexpected)?)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(OperationAck { op_id, seq })
    }

    async fn list_operations_after(
        &self,
        workspace_id: Uuid,
        after_seq: i64,
        limit: Option<i64>,
        up_to_seq: Option<i64>,
    ) -> Result<OperationsPage, RepositoryError> {
        let limit = limit.unwrap_or(DEFAULT_OPS_LIMIT).clamp(1, MAX_OPS_LIMIT);

        let workspace_latest_seq =
            sqlx::query_as::<_, (i64,)>("SELECT operation_seq FROM workspaces WHERE id = $1")
                .bind(workspace_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_error)?
                .ok_or(RepositoryError::NotFound)?
                .0;
        let latest_seq = up_to_seq
            .map(|requested| requested.min(workspace_latest_seq))
            .unwrap_or(workspace_latest_seq);

        let rows = sqlx::query_as::<_, OperationRow>(
            "SELECT seq, op_id, actor_id, operation
             FROM operations
             WHERE workspace_id = $1 AND seq > $2 AND seq <= $3
             ORDER BY seq ASC
             LIMIT $4",
        )
        .bind(workspace_id)
        .bind(after_seq)
        .bind(latest_seq)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        let operations = rows
            .into_iter()
            .map(|row| {
                let operation: Operation = serde_json::from_value(row.operation)
                    .map_err(|_| RepositoryError::Unexpected)?;
                Ok(LoggedOperation {
                    seq: row.seq,
                    op_id: row.op_id,
                    actor_id: row.actor_id,
                    operation,
                })
            })
            .collect::<Result<Vec<_>, RepositoryError>>()?;

        Ok(OperationsPage {
            operations,
            latest_seq,
        })
    }
}
