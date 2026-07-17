use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::{Map, Value};
use sqlx::{PgConnection, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::embeddings::{
    DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, canonical_block_text, content_hash,
};
use crate::application::ports::RepositoryError;
use crate::application::ports::page::{
    AppliedOperation, Breadcrumb, LoggedOperation, OperationAck, OperationGroup,
    OperationGroupMetadata, OperationsPage, PageEditor, PageList, PageRepository, PageSummary,
    PageTree, PageView, PermanentDeleteResult, PublicLink, SearchResult, TransferSubtreeResult,
    TrashEntry,
};
use crate::domain::block::{
    Block, BlockTree, BlockType, Operation, apply_operation, parse_block_type,
};
use crate::domain::error::DomainError;

const BLOCK_COLUMNS: &str = "id, workspace_id, type, properties, content, parent_id, trashed_at, trashed_index, prop_versions";

const DEFAULT_OPS_LIMIT: i64 = 500;
const MAX_OPS_LIMIT: i64 = 1000;

const EFFECTIVE_TRASH_ROOTS_CTE: &str = "WITH RECURSIVE trash_ancestry AS (
     SELECT b.id AS block_id, p.id AS ancestor_id, p.parent_id, p.trashed_at,
            ARRAY[b.id, p.id] AS path
     FROM blocks b
     JOIN blocks p ON p.id = b.parent_id AND p.workspace_id = $1
     WHERE b.workspace_id = $1 AND b.trashed_at IS NOT NULL
     UNION ALL
     SELECT a.block_id, p.id, p.parent_id, p.trashed_at, a.path || p.id
     FROM trash_ancestry a
     JOIN blocks p ON p.id = a.parent_id AND p.workspace_id = $1
     WHERE NOT p.id = ANY(a.path)
 ), effective_trash_roots AS (
     SELECT b.id, b.type, b.properties, b.parent_id, b.trashed_at
     FROM blocks b
     WHERE b.workspace_id = $1
       AND b.trashed_at IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM trash_ancestry a
           WHERE a.block_id = b.id AND a.trashed_at IS NOT NULL
       )
 )";

fn list_trash_sql() -> String {
    format!(
        "{EFFECTIVE_TRASH_ROOTS_CTE}, page_ancestry AS (
             SELECT r.id AS root_id, r.id, r.type, r.properties, r.parent_id,
                    0 AS depth, ARRAY[r.id] AS path
             FROM effective_trash_roots r
             UNION ALL
             SELECT a.root_id, p.id, p.type, p.properties, p.parent_id,
                    a.depth + 1, a.path || p.id
             FROM page_ancestry a
             JOIN blocks p ON p.id = a.parent_id AND p.workspace_id = $1
             WHERE NOT p.id = ANY(a.path)
         )
         SELECT r.id,
                r.type,
                COALESCE(NULLIF(r.properties->>'title', ''), NULLIF(r.properties->>'text', ''), '') AS title,
                r.trashed_at,
                page.id AS page_id,
                NULLIF(page.properties->>'title', '') AS page_title
         FROM effective_trash_roots r
         LEFT JOIN LATERAL (
             SELECT a.id, a.properties
             FROM page_ancestry a
             WHERE a.root_id = r.id AND a.type = 'page'
               AND NOT EXISTS (
                   SELECT 1 FROM workspace_page_roots wpr
                   WHERE wpr.workspace_id = $1 AND wpr.root_page_id = a.id
               )
             ORDER BY a.depth
             LIMIT 1
         ) page ON TRUE
         ORDER BY r.trashed_at DESC, r.id"
    )
}

fn permanent_delete_eligibility_sql() -> String {
    format!(
        "{EFFECTIVE_TRASH_ROOTS_CTE}
         SELECT b.id
         FROM blocks b
         JOIN effective_trash_roots r ON r.id = b.id
         WHERE b.workspace_id = $1 AND b.id = $2
         FOR UPDATE OF b"
    )
}

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
    group_id: Option<Uuid>,
    group_actor_id: Option<Uuid>,
    group_source: Option<String>,
    group_provenance: Option<Value>,
    group_ordinal: Option<i32>,
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
    page_id: Option<Uuid>,
    page_title: Option<String>,
}

#[derive(sqlx::FromRow)]
struct RecentEditorRow {
    user_id: Uuid,
    display_name: String,
    avatar_key: Option<String>,
    last_edited_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct SearchResultRow {
    workspace_id: Uuid,
    workspace_name: String,
    page_id: Uuid,
    page_title: String,
    page_icon: String,
    block_id: Uuid,
    block_type: String,
    snippet: String,
    rank: f32,
}

#[derive(sqlx::FromRow)]
struct PublicLinkRow {
    token: Uuid,
    created_at: DateTime<Utc>,
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

fn has_trashed_ancestry(tree: &BlockTree, block_id: Uuid) -> bool {
    let mut current = Some(block_id);
    let mut remaining = tree.blocks.len().saturating_add(1);
    while let Some(id) = current {
        if remaining == 0 {
            return true;
        }
        remaining -= 1;
        let Some(block) = tree.blocks.get(&id) else {
            return true;
        };
        if block.trashed_at.is_some() {
            return true;
        }
        current = block.parent_id;
    }
    false
}

fn is_in_subtree(tree: &BlockTree, root_id: Uuid, block_id: Uuid) -> bool {
    let mut current = Some(block_id);
    let mut remaining = tree.blocks.len().saturating_add(1);
    while let Some(id) = current {
        if id == root_id {
            return true;
        }
        if remaining == 0 {
            return false;
        }
        remaining -= 1;
        current = tree.blocks.get(&id).and_then(|block| block.parent_id);
    }
    false
}

async fn sync_embedding_job(
    tx: &mut Transaction<'_, Postgres>,
    tree: &BlockTree,
    block_id: Uuid,
    now: DateTime<Utc>,
) -> Result<(), RepositoryError> {
    let block = tree
        .blocks
        .get(&block_id)
        .ok_or(RepositoryError::Unexpected)?;
    if has_trashed_ancestry(tree, block_id) {
        sqlx::query("DELETE FROM block_embedding_jobs WHERE workspace_id = $1 AND block_id = $2")
            .bind(block.workspace_id)
            .bind(block.id)
            .execute(&mut **tx)
            .await
            .map_err(map_sqlx_error)?;
        sqlx::query("DELETE FROM block_embeddings WHERE workspace_id = $1 AND block_id = $2")
            .bind(block.workspace_id)
            .bind(block.id)
            .execute(&mut **tx)
            .await
            .map_err(map_sqlx_error)?;
        return Ok(());
    }

    let Some(content) = canonical_block_text(block) else {
        sqlx::query("DELETE FROM block_embedding_jobs WHERE workspace_id = $1 AND block_id = $2")
            .bind(block.workspace_id)
            .bind(block.id)
            .execute(&mut **tx)
            .await
            .map_err(map_sqlx_error)?;
        sqlx::query("DELETE FROM block_embeddings WHERE workspace_id = $1 AND block_id = $2")
            .bind(block.workspace_id)
            .bind(block.id)
            .execute(&mut **tx)
            .await
            .map_err(map_sqlx_error)?;
        return Ok(());
    };
    let hash = content_hash(DEFAULT_EMBEDDING_MODEL, &content);

    sqlx::query(
        "DELETE FROM block_embeddings
         WHERE workspace_id = $1 AND block_id = $2
           AND (model <> $3 OR content_hash <> $4)",
    )
    .bind(block.workspace_id)
    .bind(block.id)
    .bind(DEFAULT_EMBEDDING_MODEL)
    .bind(&hash[..])
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;

    let current = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS (
             SELECT 1 FROM block_embeddings
             WHERE workspace_id = $1 AND block_id = $2 AND model = $3 AND content_hash = $4
         )",
    )
    .bind(block.workspace_id)
    .bind(block.id)
    .bind(DEFAULT_EMBEDDING_MODEL)
    .bind(&hash[..])
    .fetch_one(&mut **tx)
    .await
    .map_err(map_sqlx_error)?
    .0;
    if current {
        sqlx::query("DELETE FROM block_embedding_jobs WHERE workspace_id = $1 AND block_id = $2")
            .bind(block.workspace_id)
            .bind(block.id)
            .execute(&mut **tx)
            .await
            .map_err(map_sqlx_error)?;
    } else {
        sqlx::query(
            "INSERT INTO block_embedding_jobs
                 (workspace_id, block_id, model, dimensions, content, content_hash,
                  attempts, available_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7, $7)
             ON CONFLICT (workspace_id, block_id) DO UPDATE
             SET model = EXCLUDED.model, dimensions = EXCLUDED.dimensions,
                 content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
                 attempts = 0, available_at = EXCLUDED.available_at,
                 lease_token = NULL, leased_until = NULL, last_error = NULL,
                 updated_at = EXCLUDED.updated_at
             WHERE block_embedding_jobs.model IS DISTINCT FROM EXCLUDED.model
                OR block_embedding_jobs.content_hash IS DISTINCT FROM EXCLUDED.content_hash",
        )
        .bind(block.workspace_id)
        .bind(block.id)
        .bind(DEFAULT_EMBEDDING_MODEL)
        .bind(EMBEDDING_DIMENSIONS as i32)
        .bind(content)
        .bind(&hash[..])
        .bind(now)
        .execute(&mut **tx)
        .await
        .map_err(map_sqlx_error)?;
    }
    Ok(())
}

async fn sync_operation_embeddings(
    tx: &mut Transaction<'_, Postgres>,
    tree: &BlockTree,
    operation: &Operation,
    touched: &[Uuid],
    now: DateTime<Utc>,
) -> Result<(), RepositoryError> {
    let mut ids: std::collections::HashSet<Uuid> = touched.iter().copied().collect();
    if let Operation::RestoreBlock { block_id, .. } = operation {
        ids.extend(
            tree.blocks
                .keys()
                .copied()
                .filter(|id| is_in_subtree(tree, *block_id, *id)),
        );
    }
    if let Operation::DeleteBlock { block_id, .. } = operation {
        sqlx::query(
            "WITH RECURSIVE subtree AS (
                 SELECT id FROM blocks WHERE id = $1 AND workspace_id = $2
                 UNION ALL
                 SELECT b.id FROM subtree s JOIN blocks b ON b.parent_id = s.id
                 WHERE b.workspace_id = $2
             )
             DELETE FROM block_embedding_jobs j USING subtree s
             WHERE j.workspace_id = $2 AND j.block_id = s.id",
        )
        .bind(block_id)
        .bind(
            tree.blocks
                .get(block_id)
                .ok_or(RepositoryError::Unexpected)?
                .workspace_id,
        )
        .execute(&mut **tx)
        .await
        .map_err(map_sqlx_error)?;
    }
    for id in ids {
        sync_embedding_job(tx, tree, id, now).await?;
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

    async fn get_page_for_block(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
    ) -> Result<PageView, RepositoryError> {
        let page_id = sqlx::query_as::<_, (Uuid,)>(
            "WITH RECURSIVE ancestors AS (
                 SELECT id, type, parent_id, 0 AS depth
                 FROM blocks WHERE workspace_id=$1 AND id=$2 AND trashed_at IS NULL
                 UNION ALL
                 SELECT p.id, p.type, p.parent_id, a.depth+1
                 FROM ancestors a JOIN blocks p ON p.id=a.parent_id
                 WHERE p.workspace_id=$1 AND p.trashed_at IS NULL
             )
             SELECT id FROM ancestors WHERE type='page' ORDER BY depth LIMIT 1",
        )
        .bind(workspace_id)
        .bind(block_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(page_not_found)?
        .0;
        self.get_page(workspace_id, page_id).await
    }

    async fn list_trash(&self, workspace_id: Uuid) -> Result<Vec<TrashEntry>, RepositoryError> {
        // Só as raízes das subárvores no lixo: descendentes voltam junto no restore.
        let query = list_trash_sql();
        let rows = sqlx::query_as::<_, TrashRow>(&query)
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
                    page_id: row.page_id,
                    page_title: row.page_title,
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
        if let Some((seq, stored)) = sqlx::query_as::<_, (i64, Value)>(
            "SELECT seq, operation FROM operations WHERE workspace_id = $1 AND op_id = $2",
        )
        .bind(workspace_id)
        .bind(op_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        {
            if stored != serde_json::to_value(operation).map_err(|_| RepositoryError::Unexpected)? {
                return Err(RepositoryError::Domain(DomainError::Validation(
                    "Operation replay conflicts with persisted operation",
                )));
            }
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
        sync_operation_embeddings(&mut tx, &tree, operation, &touched, now).await?;

        // Publicação nunca sobrevive ao envio da página (ou de um ancestral) ao lixo.
        // O restore é deliberadamente assimétrico: não republica conteúdo.
        if let Operation::DeleteBlock { block_id, .. } = operation {
            sqlx::query(
                "WITH RECURSIVE subtree AS (
                     SELECT id, type FROM blocks WHERE id = $1 AND workspace_id = $2
                     UNION ALL
                     SELECT b.id, b.type FROM subtree s
                     JOIN blocks b ON b.parent_id = s.id
                     WHERE b.workspace_id = $2
                 )
                 UPDATE public_page_links l
                 SET revoked_at = $3
                 FROM subtree s
                 WHERE l.page_id = s.id AND s.type = 'page' AND l.revoked_at IS NULL",
            )
            .bind(block_id)
            .bind(workspace_id)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
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

    async fn transfer_subtree(
        &self,
        source_workspace_id: Uuid,
        destination_workspace_id: Uuid,
        block_id: Uuid,
        transfer_id: Uuid,
        actor_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<TransferSubtreeResult, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let (first, second) = if source_workspace_id < destination_workspace_id {
            (source_workspace_id, destination_workspace_id)
        } else {
            (destination_workspace_id, source_workspace_id)
        };
        for workspace_id in [first, second] {
            sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
                .bind(workspace_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(map_sqlx_error)?
                .ok_or(RepositoryError::NotFound)?;
        }
        let owned_workspaces = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM workspace_members
             WHERE user_id=$1 AND workspace_id=ANY($2) AND role='owner'",
        )
        .bind(actor_id)
        .bind(&[source_workspace_id, destination_workspace_id][..])
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;
        if owned_workspaces != 2 {
            return Err(RepositoryError::Domain(DomainError::Forbidden));
        }

        if let Some((source_seq, source_op_id, source_actor, source_value)) =
            sqlx::query_as::<_, (i64, Uuid, Uuid, Value)>(
                "SELECT seq,op_id,actor_id,operation FROM operations
                 WHERE workspace_id=$1 AND op_id=$2",
            )
            .bind(source_workspace_id)
            .bind(transfer_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
        {
            let source_operation: Operation =
                serde_json::from_value(source_value).map_err(|_| RepositoryError::Unexpected)?;
            if !matches!(
                &source_operation,
                Operation::TransferSubtreeOut {
                    transfer_id: stored_transfer_id,
                    block_id: stored_block_id,
                    destination_workspace_id: stored_destination,
                    ..
                } if *stored_transfer_id == transfer_id
                    && *stored_block_id == block_id
                    && *stored_destination == destination_workspace_id
            ) {
                return Err(RepositoryError::Domain(DomainError::Validation(
                    "Transfer replay conflicts with persisted operation",
                )));
            }
            let (destination_seq, destination_op_id, destination_actor, destination_value) =
                sqlx::query_as::<_, (i64, Uuid, Uuid, Value)>(
                    "SELECT seq,op_id,actor_id,operation FROM operations
                     WHERE workspace_id=$1
                       AND operation->>'type'='transfer_subtree_in'
                       AND operation->>'transferId'=$2
                       AND operation->>'sourceWorkspaceId'=$3",
                )
                .bind(destination_workspace_id)
                .bind(transfer_id.to_string())
                .bind(source_workspace_id.to_string())
                .fetch_optional(&mut *tx)
                .await
                .map_err(map_sqlx_error)?
                .ok_or(RepositoryError::Unexpected)?;
            let destination_operation: Operation = serde_json::from_value(destination_value)
                .map_err(|_| RepositoryError::Unexpected)?;
            if !matches!(
                &destination_operation,
                Operation::TransferSubtreeIn {
                    transfer_id: stored_transfer_id,
                    source_workspace_id: stored_source,
                    ..
                } if *stored_transfer_id == transfer_id && *stored_source == source_workspace_id
            ) {
                return Err(RepositoryError::Domain(DomainError::Validation(
                    "Transfer replay conflicts with destination operation",
                )));
            }
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(TransferSubtreeResult {
                source: AppliedOperation {
                    envelope: LoggedOperation {
                        seq: source_seq,
                        op_id: source_op_id,
                        actor_id: source_actor,
                        operation: source_operation,
                        group: None,
                    },
                    inserted: false,
                },
                destination: AppliedOperation {
                    envelope: LoggedOperation {
                        seq: destination_seq,
                        op_id: destination_op_id,
                        actor_id: destination_actor,
                        operation: destination_operation,
                        group: None,
                    },
                    inserted: false,
                },
            });
        }

        let source_root = sqlx::query_as::<_, (Uuid,)>(
            "SELECT root_page_id FROM workspace_page_roots WHERE workspace_id=$1",
        )
        .bind(source_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;
        if block_id == source_root {
            return Err(RepositoryError::Domain(DomainError::Validation(
                "Cannot transfer the workspace root",
            )));
        }
        let destination_root = sqlx::query_as::<_, (Uuid,)>(
            "SELECT root_page_id FROM workspace_page_roots WHERE workspace_id=$1",
        )
        .bind(destination_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;

        let query = format!(
            "WITH RECURSIVE subtree AS (
                 SELECT {BLOCK_COLUMNS} FROM blocks
                 WHERE id=$1 AND workspace_id=$2 AND type='page' AND trashed_at IS NULL
                 UNION ALL
                 SELECT b.id,b.workspace_id,b.type,b.properties,b.content,b.parent_id,
                        b.trashed_at,b.trashed_index,b.prop_versions
                 FROM subtree s JOIN blocks b ON b.parent_id=s.id
                 WHERE b.workspace_id=$2
             ) SELECT * FROM subtree"
        );
        let rows = sqlx::query_as::<_, BlockRow>(&query)
            .bind(block_id)
            .bind(source_workspace_id)
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
        let source_parent_id = blocks
            .iter()
            .find(|block| block.id == block_id)
            .and_then(|block| block.parent_id)
            .ok_or_else(page_not_found)?;
        let block_ids: Vec<_> = blocks.iter().map(|block| block.id).collect();
        let page_ids: Vec<_> = blocks
            .iter()
            .filter(|block| block.block_type == BlockType::Page)
            .map(|block| block.id)
            .collect();

        let source_parent_updated = sqlx::query(
            "UPDATE blocks SET content=array_remove(content,$1),updated_at=$3
             WHERE id=$2 AND workspace_id=$4 AND $1=ANY(content)",
        )
        .bind(block_id)
        .bind(source_parent_id)
        .bind(now)
        .bind(source_workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .rows_affected();
        if source_parent_updated != 1 {
            return Err(RepositoryError::Domain(DomainError::Validation(
                "content/parentId mismatch",
            )));
        }

        sqlx::query("DELETE FROM block_embedding_jobs WHERE workspace_id=$1 AND block_id=ANY($2)")
            .bind(source_workspace_id)
            .bind(&block_ids)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        sqlx::query("DELETE FROM block_embeddings WHERE workspace_id=$1 AND block_id=ANY($2)")
            .bind(source_workspace_id)
            .bind(&block_ids)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        sqlx::query(
            "UPDATE public_page_links
             SET revoked_at=$2,revoked_by=$3,workspace_id=$4
             WHERE page_id=ANY($1) AND revoked_at IS NULL",
        )
        .bind(&page_ids)
        .bind(now)
        .bind(actor_id)
        .bind(destination_workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        sqlx::query("UPDATE public_page_links SET workspace_id=$2 WHERE page_id=ANY($1)")
            .bind(&page_ids)
            .bind(destination_workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        sqlx::query("DELETE FROM page_recent_editors WHERE page_id=ANY($1)")
            .bind(&page_ids)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        sqlx::query(
            "UPDATE blocks SET workspace_id=$2,updated_at=$3 WHERE id=ANY($1) AND workspace_id=$4",
        )
        .bind(&block_ids)
        .bind(destination_workspace_id)
        .bind(now)
        .bind(source_workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        sqlx::query("UPDATE blocks SET parent_id=$2 WHERE id=$1 AND workspace_id=$3")
            .bind(block_id)
            .bind(destination_root)
            .bind(destination_workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        let destination_index = sqlx::query_as::<_, (i64,)>(
            "UPDATE blocks SET content=array_append(content,$1),updated_at=$3
             WHERE id=$2 AND workspace_id=$4
             RETURNING (cardinality(content)-1)::bigint",
        )
        .bind(block_id)
        .bind(destination_root)
        .bind(now)
        .bind(destination_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;

        for block in &mut blocks {
            block.workspace_id = destination_workspace_id;
            if block.id == block_id {
                block.parent_id = Some(destination_root);
            }
        }
        let destination_root_row = sqlx::query_as::<_, BlockRow>(&format!(
            "SELECT {BLOCK_COLUMNS} FROM blocks WHERE id=$1 AND workspace_id=$2"
        ))
        .bind(destination_root)
        .bind(destination_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        let mut embedding_blocks = blocks.clone();
        embedding_blocks.push(Block::try_from(destination_root_row)?);
        let destination_tree = BlockTree::from_blocks(embedding_blocks);
        for id in &block_ids {
            sync_embedding_job(&mut tx, &destination_tree, *id, now).await?;
        }

        let source_operation = Operation::TransferSubtreeOut {
            op_id: transfer_id,
            transfer_id,
            block_id,
            destination_workspace_id,
        };
        let destination_operation = Operation::TransferSubtreeIn {
            op_id: Uuid::new_v4(),
            transfer_id,
            blocks,
            parent_id: destination_root,
            index: destination_index,
            source_workspace_id,
        };
        let source_seq = sqlx::query_as::<_, (i64,)>(
            "UPDATE workspaces SET operation_seq=operation_seq+1 WHERE id=$1 RETURNING operation_seq",
        )
        .bind(source_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;
        let destination_seq = sqlx::query_as::<_, (i64,)>(
            "UPDATE workspaces SET operation_seq=operation_seq+1 WHERE id=$1 RETURNING operation_seq",
        )
        .bind(destination_workspace_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .0;
        for (workspace_id, seq, operation) in [
            (source_workspace_id, source_seq, &source_operation),
            (
                destination_workspace_id,
                destination_seq,
                &destination_operation,
            ),
        ] {
            sqlx::query(
                "INSERT INTO operations(workspace_id,seq,op_id,actor_id,operation,applied_at)
                 VALUES($1,$2,$3,$4,$5,$6)",
            )
            .bind(workspace_id)
            .bind(seq)
            .bind(operation.op_id())
            .bind(actor_id)
            .bind(serde_json::to_value(operation).map_err(|_| RepositoryError::Unexpected)?)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        tx.commit().await.map_err(map_sqlx_error)?;

        Ok(TransferSubtreeResult {
            source: AppliedOperation {
                envelope: LoggedOperation {
                    seq: source_seq,
                    op_id: source_operation.op_id(),
                    actor_id,
                    operation: source_operation,
                    group: None,
                },
                inserted: true,
            },
            destination: AppliedOperation {
                envelope: LoggedOperation {
                    seq: destination_seq,
                    op_id: destination_operation.op_id(),
                    actor_id,
                    operation: destination_operation,
                    group: None,
                },
                inserted: true,
            },
        })
    }

    async fn apply_operation_batch(
        &self,
        workspace_id: Uuid,
        actor_id: Uuid,
        operations: &[Operation],
        group: Option<&OperationGroup>,
        expected_workspace_seq: Option<i64>,
        now: DateTime<Utc>,
    ) -> Result<Vec<crate::application::ports::page::AppliedOperation>, RepositoryError> {
        if operations.is_empty() {
            return Ok(Vec::new());
        }
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let current_seq = sqlx::query_as::<_, (i64,)>(
            "SELECT operation_seq FROM workspaces WHERE id=$1 FOR UPDATE",
        )
        .bind(workspace_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or(RepositoryError::NotFound)?
        .0;
        if expected_workspace_seq.is_some_and(|expected| expected != current_seq) {
            return Err(RepositoryError::Domain(DomainError::Validation(
                "Page changed while the AI was formatting it",
            )));
        }

        if let Some(group) = group {
            sqlx::query("INSERT INTO operation_groups(id,workspace_id,actor_id,source,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (workspace_id,id) DO NOTHING")
                .bind(group.id).bind(workspace_id).bind(actor_id).bind(&group.source).bind(&group.provenance).bind(now)
                .execute(&mut *tx).await.map_err(map_sqlx_error)?;
            let stored = sqlx::query_as::<_, (Uuid, String, Value)>(
                "SELECT actor_id, source, provenance FROM operation_groups WHERE workspace_id=$1 AND id=$2",
            )
            .bind(workspace_id)
            .bind(group.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
            if stored != (actor_id, group.source.clone(), group.provenance.clone()) {
                return Err(RepositoryError::Domain(DomainError::Validation(
                    "Operation group replay conflicts with persisted group",
                )));
            }
        }

        let query = format!("SELECT {BLOCK_COLUMNS} FROM blocks WHERE workspace_id=$1");
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
        let mut applied = Vec::with_capacity(operations.len());
        let mut next_ordinal = if let Some(group) = group {
            sqlx::query_as::<_, (i32,)>(
                "SELECT COALESCE(MAX(group_ordinal), -1) + 1 FROM operations WHERE workspace_id=$1 AND group_id=$2",
            )
            .bind(workspace_id)
            .bind(group.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            .0
        } else {
            0
        };

        for operation in operations {
            let op_id = operation.op_id();
            if let Some(row) = sqlx::query_as::<_, OperationRow>(
                "SELECT o.seq,o.op_id,o.actor_id,o.operation,o.group_id,g.actor_id AS group_actor_id,g.source AS group_source,g.provenance AS group_provenance,o.group_ordinal
                 FROM operations o LEFT JOIN operation_groups g ON g.workspace_id=o.workspace_id AND g.id=o.group_id
                 WHERE o.workspace_id=$1 AND o.op_id=$2",
            )
            .bind(workspace_id)
            .bind(op_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            {
                let requested = serde_json::to_value(operation)
                    .map_err(|_| RepositoryError::Unexpected)?;
                if row.operation != requested || row.group_id != group.map(|value| value.id) {
                    return Err(RepositoryError::Domain(DomainError::Validation(
                        "Operation replay conflicts with persisted operation",
                    )));
                }
                let canonical: Operation = serde_json::from_value(row.operation)
                    .map_err(|_| RepositoryError::Unexpected)?;
                applied.push(crate::application::ports::page::AppliedOperation {
                    envelope: LoggedOperation {
                        seq: row.seq,
                        op_id: row.op_id,
                        actor_id: row.actor_id,
                        operation: canonical,
                        group: row.group_id.map(|id| OperationGroupMetadata {
                            group_id: id,
                            group_ordinal: row.group_ordinal.expect("group ordinal constrained"),
                            source: row.group_source.expect("group source joined"),
                            initiated_by: row.group_actor_id.expect("group actor joined"),
                            provenance: row.group_provenance.expect("group provenance joined"),
                        }),
                    },
                    inserted: false,
                });
                continue;
            }
            let touched = apply_operation(&mut tree, operation, workspace_id, now)?;
            let inserted = match operation {
                Operation::InsertBlock { block, .. } => Some(block.id),
                _ => None,
            };
            for id in &touched {
                let block = tree.blocks.get(id).expect("touched block exists");
                if Some(*id) == inserted {
                    insert_block_row(&mut tx, block, actor_id).await?;
                } else {
                    update_block_row(&mut tx, block).await?;
                }
            }
            sync_operation_embeddings(&mut tx, &tree, operation, &touched, now).await?;
            if let Operation::DeleteBlock { block_id, .. } = operation {
                sqlx::query("WITH RECURSIVE subtree AS (SELECT id,type FROM blocks WHERE id=$1 AND workspace_id=$2 UNION ALL SELECT b.id,b.type FROM subtree s JOIN blocks b ON b.parent_id=s.id WHERE b.workspace_id=$2) UPDATE public_page_links l SET revoked_at=$3 FROM subtree s WHERE l.page_id=s.id AND s.type='page' AND l.revoked_at IS NULL")
                    .bind(block_id).bind(workspace_id).bind(now).execute(&mut *tx).await.map_err(map_sqlx_error)?;
            }
            let mut page_ids = std::collections::HashSet::new();
            for id in &touched {
                if let Some(page_id) = resolve_containing_page(&tree, *id) {
                    page_ids.insert(page_id);
                }
            }
            for page_id in page_ids {
                sqlx::query("INSERT INTO page_recent_editors(page_id,user_id,last_edited_at) VALUES($1,$2,$3) ON CONFLICT(page_id,user_id) DO UPDATE SET last_edited_at=EXCLUDED.last_edited_at")
                    .bind(page_id).bind(actor_id).bind(now).execute(&mut *tx).await.map_err(map_sqlx_error)?;
            }
            let seq=sqlx::query_as::<_,(i64,)>("UPDATE workspaces SET operation_seq=operation_seq+1 WHERE id=$1 RETURNING operation_seq")
                .bind(workspace_id).fetch_one(&mut *tx).await.map_err(map_sqlx_error)?.0;
            sqlx::query("INSERT INTO operations(workspace_id,seq,op_id,actor_id,operation,group_id,group_ordinal) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(workspace_id).bind(seq).bind(op_id).bind(actor_id)
                .bind(serde_json::to_value(operation).map_err(|_|RepositoryError::Unexpected)?)
                .bind(group.map(|g|g.id)).bind(group.map(|_|next_ordinal)).execute(&mut *tx).await.map_err(map_sqlx_error)?;
            let metadata = group.map(|value| OperationGroupMetadata {
                group_id: value.id,
                group_ordinal: next_ordinal,
                source: value.source.clone(),
                initiated_by: actor_id,
                provenance: value.provenance.clone(),
            });
            if group.is_some() {
                next_ordinal += 1;
            }
            applied.push(crate::application::ports::page::AppliedOperation {
                envelope: LoggedOperation {
                    seq,
                    op_id,
                    actor_id,
                    operation: operation.clone(),
                    group: metadata,
                },
                inserted: true,
            });
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(applied)
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
            "SELECT o.seq, o.op_id, o.actor_id, o.operation, o.group_id,
                    g.actor_id AS group_actor_id,
                    g.source AS group_source, g.provenance AS group_provenance, o.group_ordinal
             FROM operations o LEFT JOIN operation_groups g
               ON g.workspace_id=o.workspace_id AND g.id=o.group_id
             WHERE o.workspace_id = $1 AND o.seq > $2 AND o.seq <= $3
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
                    group: row.group_id.map(|id| OperationGroupMetadata {
                        group_id: id,
                        group_ordinal: row.group_ordinal.unwrap_or_default(),
                        source: row.group_source.unwrap_or_default(),
                        initiated_by: row.group_actor_id.expect("group actor joined"),
                        provenance: row.group_provenance.unwrap_or(Value::Null),
                    }),
                })
            })
            .collect::<Result<Vec<_>, RepositoryError>>()?;

        Ok(OperationsPage {
            operations,
            latest_seq,
        })
    }

    async fn search(
        &self,
        user_id: Uuid,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchResult>, RepositoryError> {
        let rows = sqlx::query_as::<_, SearchResultRow>(
            "WITH RECURSIVE search_query AS (
                 SELECT websearch_to_tsquery('simple', $2) AS value
             ), candidates AS (
                 SELECT b.id, b.workspace_id, b.type, b.properties, b.parent_id,
                        ts_rank_cd(b.search_document, q.value)::real AS rank
                 FROM blocks b
                 JOIN workspace_members wm
                   ON wm.workspace_id = b.workspace_id AND wm.user_id = $1
                 CROSS JOIN search_query q
                 WHERE b.search_document @@ q.value
                   AND b.trashed_at IS NULL
             ), ancestors AS (
                 SELECT c.id AS candidate_id, c.id, c.workspace_id, c.type,
                        c.properties, c.parent_id, 0 AS depth, false AS trashed
                 FROM candidates c
                 UNION ALL
                 SELECT a.candidate_id, p.id, p.workspace_id, p.type,
                        p.properties, p.parent_id, a.depth + 1,
                        p.trashed_at IS NOT NULL
                 FROM ancestors a
                 JOIN blocks p ON p.id = a.parent_id AND p.workspace_id = a.workspace_id
             ), containing_pages AS (
                 SELECT DISTINCT ON (candidate_id)
                        candidate_id, id AS page_id, properties AS page_properties
                 FROM ancestors
                 WHERE type = 'page'
                 ORDER BY candidate_id, depth
             )
             SELECT c.workspace_id,
                    w.name AS workspace_name,
                    cp.page_id,
                    COALESCE(cp.page_properties->>'title', '') AS page_title,
                    COALESCE(cp.page_properties->>'icon', '') AS page_icon,
                    c.id AS block_id,
                    c.type AS block_type,
                    left(COALESCE(NULLIF(c.properties->>'title', ''),
                                  NULLIF(c.properties->>'text', ''),
                                  NULLIF(c.properties->>'caption', ''), ''), 240) AS snippet,
                    c.rank
             FROM candidates c
             JOIN containing_pages cp ON cp.candidate_id = c.id
             JOIN workspaces w ON w.id = c.workspace_id
             WHERE NOT EXISTS (
                 SELECT 1 FROM ancestors a
                 WHERE a.candidate_id = c.id AND a.trashed
             )
               AND NOT EXISTS (
                 SELECT 1 FROM workspace_page_roots r WHERE r.root_page_id = cp.page_id
             )
             ORDER BY c.rank DESC, c.workspace_id, cp.page_id, c.id
             LIMIT $3",
        )
        .bind(user_id)
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        rows.into_iter()
            .map(|row| {
                Ok(SearchResult {
                    workspace_id: row.workspace_id,
                    workspace_name: row.workspace_name,
                    page_id: row.page_id,
                    page_title: row.page_title,
                    page_icon: row.page_icon,
                    block_id: row.block_id,
                    block_type: parse_block_type(&row.block_type)?,
                    snippet: row.snippet,
                    rank: row.rank,
                })
            })
            .collect()
    }

    async fn get_public_link(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
    ) -> Result<Option<PublicLink>, RepositoryError> {
        let row = sqlx::query_as::<_, PublicLinkRow>(
            "SELECT token, created_at
             FROM public_page_links
             WHERE workspace_id = $1 AND page_id = $2 AND revoked_at IS NULL",
        )
        .bind(workspace_id)
        .bind(page_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.map(|row| PublicLink {
            token: row.token,
            created_at: row.created_at,
        }))
    }

    async fn create_public_link(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
        created_by: Uuid,
        now: DateTime<Utc>,
    ) -> Result<PublicLink, RepositoryError> {
        let token = Uuid::new_v4();
        let row = sqlx::query_as::<_, PublicLinkRow>(
            "WITH RECURSIVE ancestors AS (
                 SELECT id, workspace_id, type, parent_id, trashed_at
                 FROM blocks WHERE id = $2 AND workspace_id = $1 AND type = 'page'
                 UNION ALL
                 SELECT p.id, p.workspace_id, p.type, p.parent_id, p.trashed_at
                 FROM ancestors a JOIN blocks p ON p.id = a.parent_id
                 WHERE p.workspace_id = $1
             ), eligible AS (
                 SELECT $2::uuid AS page_id
                 WHERE EXISTS (SELECT 1 FROM ancestors)
                   AND NOT EXISTS (SELECT 1 FROM ancestors WHERE trashed_at IS NOT NULL)
                   AND NOT EXISTS (SELECT 1 FROM workspace_page_roots WHERE root_page_id = $2)
             )
             INSERT INTO public_page_links (workspace_id, page_id, token, created_by, created_at)
             SELECT $1, page_id, $3, $4, $5 FROM eligible
             ON CONFLICT (page_id) WHERE revoked_at IS NULL
             DO UPDATE SET page_id = EXCLUDED.page_id
             RETURNING token, created_at",
        )
        .bind(workspace_id)
        .bind(page_id)
        .bind(token)
        .bind(created_by)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(page_not_found)?;
        Ok(PublicLink {
            token: row.token,
            created_at: row.created_at,
        })
    }

    async fn revoke_public_link(
        &self,
        workspace_id: Uuid,
        page_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        let affected = sqlx::query(
            "UPDATE public_page_links SET revoked_at = $3
             WHERE workspace_id = $1 AND page_id = $2 AND revoked_at IS NULL",
        )
        .bind(workspace_id)
        .bind(page_id)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .rows_affected();
        Ok(affected > 0)
    }

    async fn get_public_page(&self, token: Uuid) -> Result<PageTree, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;

        let identity = sqlx::query_as::<_, (Uuid, Uuid)>(
            "WITH RECURSIVE ancestors AS (
                 SELECT b.id, b.workspace_id, b.parent_id, b.trashed_at
                 FROM public_page_links l
                 JOIN blocks b ON b.id = l.page_id AND b.workspace_id = l.workspace_id
                 WHERE l.token = $1 AND l.revoked_at IS NULL AND b.type = 'page'
                 UNION ALL
                 SELECT p.id, p.workspace_id, p.parent_id, p.trashed_at
                 FROM ancestors a JOIN blocks p ON p.id = a.parent_id
                 WHERE p.workspace_id = a.workspace_id
             )
             SELECT l.workspace_id, l.page_id
             FROM public_page_links l
             WHERE l.token = $1 AND l.revoked_at IS NULL
               AND EXISTS (SELECT 1 FROM ancestors)
               AND NOT EXISTS (SELECT 1 FROM ancestors WHERE trashed_at IS NOT NULL)",
        )
        .bind(token)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .ok_or_else(page_not_found)?;

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
                 WHERE c.workspace_id = $1 AND c.trashed_at IS NULL
                   AND (s.depth = 0 OR s.type <> 'page')
             ) SELECT {BLOCK_COLUMNS} FROM subtree"
        );
        let rows = sqlx::query_as::<_, BlockRow>(&query)
            .bind(identity.0)
            .bind(identity.1)
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
        let child_page_ids: std::collections::HashSet<Uuid> = blocks
            .iter()
            .filter(|block| block.id != identity.1 && block.block_type == BlockType::Page)
            .map(|block| block.id)
            .collect();
        blocks.retain(|block| !child_page_ids.contains(&block.id));
        for block in &mut blocks {
            block.content.retain(|id| !child_page_ids.contains(id));
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(PageTree {
            root_id: identity.1,
            blocks,
        })
    }

    async fn permanently_delete(
        &self,
        workspace_id: Uuid,
        block_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<PermanentDeleteResult, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let eligibility_query = permanent_delete_eligibility_sql();
        let eligible = sqlx::query_as::<_, (Uuid,)>(&eligibility_query)
            .bind(workspace_id)
            .bind(block_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        if eligible.is_none() {
            return Err(DomainError::Validation("Block must be a trash root").into());
        }

        let counts = sqlx::query_as::<_, (i64, i64)>(
            "WITH RECURSIVE subtree AS (
                 SELECT id, type, properties, ARRAY[id] AS path
                 FROM blocks WHERE id = $2 AND workspace_id = $1
                 UNION ALL
                 SELECT b.id, b.type, b.properties, s.path || b.id
                 FROM subtree s JOIN blocks b ON b.parent_id = s.id
                 WHERE b.workspace_id = $1 AND NOT b.id = ANY(s.path)
             ), queued AS (
                 INSERT INTO object_deletion_jobs (object_key, available_at, created_at)
                 SELECT DISTINCT properties->>'key', $3, $3 FROM subtree
                 WHERE type = 'image' AND NULLIF(properties->>'key', '') IS NOT NULL
                 ON CONFLICT (object_key) DO UPDATE
                 SET attempts = 0, available_at = EXCLUDED.available_at,
                     last_error = NULL, completed_at = NULL
                 RETURNING 1
             )
             SELECT (SELECT count(*) FROM subtree), (SELECT count(*) FROM queued)",
        )
        .bind(workspace_id)
        .bind(block_id)
        .bind(now)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        sqlx::query("DELETE FROM blocks WHERE id = $1 AND workspace_id = $2")
            .bind(block_id)
            .bind(workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(PermanentDeleteResult {
            deleted_blocks: counts.0 as u64,
            media_cleanup_queued: counts.1 as u64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_roots_exclude_every_trashed_ancestor_and_are_cycle_safe() {
        assert!(EFFECTIVE_TRASH_ROOTS_CTE.contains("FROM trash_ancestry a"));
        assert!(EFFECTIVE_TRASH_ROOTS_CTE.contains("a.trashed_at IS NOT NULL"));
        assert!(EFFECTIVE_TRASH_ROOTS_CTE.contains("NOT p.id = ANY(a.path)"));

        let list = list_trash_sql();
        let purge = permanent_delete_eligibility_sql();
        assert!(list.starts_with(EFFECTIVE_TRASH_ROOTS_CTE));
        assert!(purge.starts_with(EFFECTIVE_TRASH_ROOTS_CTE));
        assert!(purge.contains("JOIN effective_trash_roots r ON r.id = b.id"));
    }

    #[test]
    fn trash_root_queries_scope_every_block_traversal_to_the_workspace() {
        assert!(EFFECTIVE_TRASH_ROOTS_CTE.contains("b.workspace_id = $1"));
        assert!(EFFECTIVE_TRASH_ROOTS_CTE.contains("p.workspace_id = $1"));
        for query in [list_trash_sql(), permanent_delete_eligibility_sql()] {
            for parent_join in query.lines().filter(|line| line.contains("JOIN blocks p")) {
                assert!(parent_join.contains("p.workspace_id = $1"));
            }
        }
        assert!(permanent_delete_eligibility_sql().contains("b.workspace_id = $1"));
    }
}
