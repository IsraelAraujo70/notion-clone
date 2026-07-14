use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::embeddings::{EMBEDDING_DIMENSIONS, MAX_HALF_VECTOR_VALUE};
use crate::application::ports::RepositoryError;
use crate::application::ports::embedding::{
    EmbeddingJob, EmbeddingJobRepository, SemanticEmbeddingRepository, SemanticSearchResult,
};
use crate::domain::block::parse_block_type;

#[derive(Debug, Clone)]
pub struct PostgresEmbeddingRepository {
    pool: PgPool,
}

impl PostgresEmbeddingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct EmbeddingJobRow {
    workspace_id: Uuid,
    block_id: Uuid,
    model: String,
    dimensions: i32,
    content: String,
    content_hash: Vec<u8>,
    attempts: i32,
    lease_token: Uuid,
    leased_until: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct SemanticSearchRow {
    workspace_id: Uuid,
    workspace_name: String,
    page_id: Uuid,
    page_title: String,
    page_icon: String,
    block_id: Uuid,
    block_type: String,
    text: String,
    score: f32,
}

const SEMANTIC_SEARCH_SQL: &str = "WITH RECURSIVE nearest AS MATERIALIZED (
     SELECT e.block_id, e.workspace_id,
            e.embedding <=> $4::halfvec(3072) AS distance
     FROM block_embeddings e
     WHERE e.workspace_id = $2 AND e.model = $3
       AND EXISTS (
           SELECT 1 FROM workspace_members wm
           WHERE wm.workspace_id = e.workspace_id AND wm.user_id = $1
       )
     ORDER BY e.embedding <=> $4::halfvec(3072)
     LIMIT $6
 ), candidates AS (
     SELECT b.id, b.workspace_id, b.type, b.properties, b.parent_id,
            (1 - n.distance)::real AS score
     FROM nearest n
     JOIN blocks b ON b.id = n.block_id AND b.workspace_id = n.workspace_id
     WHERE b.trashed_at IS NULL
 ), ancestors AS (
     SELECT c.id AS candidate_id, c.id, c.workspace_id, c.type,
            c.properties, c.parent_id, 0 AS depth, false AS trashed
     FROM candidates c
     UNION ALL
     SELECT a.candidate_id, p.id, p.workspace_id, p.type,
            p.properties, p.parent_id, a.depth + 1, p.trashed_at IS NOT NULL
     FROM ancestors a
     JOIN blocks p ON p.id = a.parent_id AND p.workspace_id = a.workspace_id
 ), containing_pages AS (
     SELECT DISTINCT ON (candidate_id)
            candidate_id, id AS page_id, properties AS page_properties
     FROM ancestors WHERE type = 'page'
     ORDER BY candidate_id, depth
 )
 SELECT c.workspace_id, w.name AS workspace_name, cp.page_id,
        COALESCE(cp.page_properties->>'title', '') AS page_title,
        COALESCE(cp.page_properties->>'icon', '') AS page_icon,
        c.id AS block_id, c.type AS block_type,
        COALESCE(NULLIF(c.properties->>'title', ''),
                 NULLIF(c.properties->>'text', ''),
                 NULLIF(c.properties->>'caption', ''), '') AS text,
        c.score
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
 ORDER BY c.score DESC, c.workspace_id, cp.page_id, c.id
 LIMIT $5";

fn halfvec_literal(values: &[f32], dimensions: usize) -> Result<String, RepositoryError> {
    if values.len() != dimensions
        || values
            .iter()
            .any(|value| !value.is_finite() || value.abs() > MAX_HALF_VECTOR_VALUE)
    {
        return Err(RepositoryError::Unexpected);
    }
    Ok(format!(
        "[{}]",
        values
            .iter()
            .map(f32::to_string)
            .collect::<Vec<_>>()
            .join(",")
    ))
}

#[async_trait]
impl EmbeddingJobRepository for PostgresEmbeddingRepository {
    async fn claim(
        &self,
        limit: i64,
        lease_for: Duration,
    ) -> Result<Vec<EmbeddingJob>, RepositoryError> {
        let lease_seconds = i64::try_from(lease_for.as_secs())
            .unwrap_or(i64::MAX)
            .clamp(1, 300);
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let rows = sqlx::query_as::<_, EmbeddingJobRow>(
            "WITH picked AS (
                 SELECT workspace_id, block_id
                 FROM block_embedding_jobs
                 WHERE available_at <= now()
                   AND (lease_token IS NULL OR leased_until <= now())
                 ORDER BY available_at, created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT $1
             )
             UPDATE block_embedding_jobs j
             SET lease_token = gen_random_uuid(),
                 leased_until = now() + make_interval(secs => $2::double precision),
                 updated_at = now()
             FROM picked
             WHERE j.workspace_id = picked.workspace_id AND j.block_id = picked.block_id
             RETURNING j.workspace_id, j.block_id, j.model, j.dimensions, j.content,
                       j.content_hash, j.attempts, j.lease_token, j.leased_until, j.created_at",
        )
        .bind(limit.clamp(1, 100))
        .bind(lease_seconds as f64)
        .fetch_all(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;

        rows.into_iter()
            .map(|row| {
                Ok(EmbeddingJob {
                    workspace_id: row.workspace_id,
                    block_id: row.block_id,
                    model: row.model,
                    dimensions: usize::try_from(row.dimensions)
                        .map_err(|_| RepositoryError::Unexpected)?,
                    content: row.content,
                    content_hash: row.content_hash,
                    attempts: row.attempts,
                    lease_token: row.lease_token,
                    leased_until: row.leased_until,
                    created_at: row.created_at,
                })
            })
            .collect()
    }

    async fn complete(
        &self,
        job: &EmbeddingJob,
        embedding: &[f32],
    ) -> Result<bool, RepositoryError> {
        if embedding.len() != job.dimensions {
            return Err(RepositoryError::Unexpected);
        }
        let vector = halfvec_literal(embedding, job.dimensions)?;
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;

        let workspace_exists =
            sqlx::query_as::<_, (Uuid,)>("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
                .bind(job.workspace_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(map_sqlx_error)?
                .is_some();
        if !workspace_exists {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(false);
        }

        let current = sqlx::query_as::<_, (i32,)>(
            "SELECT 1
             FROM block_embedding_jobs
             WHERE workspace_id = $1 AND block_id = $2 AND lease_token = $3
               AND model = $4 AND content_hash = $5 AND dimensions = $6
               AND leased_until > clock_timestamp()
             FOR UPDATE",
        )
        .bind(job.workspace_id)
        .bind(job.block_id)
        .bind(job.lease_token)
        .bind(&job.model)
        .bind(&job.content_hash)
        .bind(job.dimensions as i32)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .is_some();
        if !current {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(false);
        }

        sqlx::query(
            "INSERT INTO block_embeddings
                 (workspace_id, block_id, model, content_hash, embedding, embedded_at)
             VALUES ($1, $2, $3, $4, $5::halfvec(3072), clock_timestamp())
             ON CONFLICT (workspace_id, block_id) DO UPDATE
             SET model = EXCLUDED.model, content_hash = EXCLUDED.content_hash,
                 embedding = EXCLUDED.embedding, embedded_at = EXCLUDED.embedded_at",
        )
        .bind(job.workspace_id)
        .bind(job.block_id)
        .bind(&job.model)
        .bind(&job.content_hash)
        .bind(vector)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;

        let removed = sqlx::query(
            "DELETE FROM block_embedding_jobs
             WHERE workspace_id = $1 AND block_id = $2 AND lease_token = $3
               AND model = $4 AND content_hash = $5 AND dimensions = $6
               AND leased_until > clock_timestamp()",
        )
        .bind(job.workspace_id)
        .bind(job.block_id)
        .bind(job.lease_token)
        .bind(&job.model)
        .bind(&job.content_hash)
        .bind(job.dimensions as i32)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .rows_affected();
        if removed != 1 {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(false);
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(true)
    }

    async fn retry(&self, job: &EmbeddingJob, error: &str) -> Result<bool, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let workspace_exists =
            sqlx::query_as::<_, (Uuid,)>("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
                .bind(job.workspace_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(map_sqlx_error)?
                .is_some();
        if !workspace_exists {
            tx.rollback().await.map_err(map_sqlx_error)?;
            return Ok(false);
        }
        let affected = sqlx::query(
            "UPDATE block_embedding_jobs
             SET attempts = attempts + 1,
                 available_at = now() + make_interval(secs => LEAST(3600, 5 * power(2, LEAST(attempts, 10)))::double precision),
                 lease_token = NULL, leased_until = NULL,
                 last_error = left($4, 500), updated_at = now()
              WHERE workspace_id = $1 AND block_id = $2 AND lease_token = $3
                AND model = $5 AND content_hash = $6
                AND dimensions = $7
                AND leased_until > clock_timestamp()",
        )
        .bind(job.workspace_id)
        .bind(job.block_id)
        .bind(job.lease_token)
        .bind(error)
        .bind(&job.model)
        .bind(&job.content_hash)
        .bind(job.dimensions as i32)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .rows_affected();
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(affected == 1)
    }
}

#[async_trait]
impl SemanticEmbeddingRepository for PostgresEmbeddingRepository {
    async fn search(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        model: &str,
        query_embedding: &[f32],
        limit: i64,
    ) -> Result<Vec<SemanticSearchResult>, RepositoryError> {
        let vector = halfvec_literal(query_embedding, EMBEDDING_DIMENSIONS)?;
        let candidate_limit = limit.saturating_mul(10).clamp(10, 500);
        let rows = sqlx::query_as::<_, SemanticSearchRow>(SEMANTIC_SEARCH_SQL)
            .bind(user_id)
            .bind(workspace_id)
            .bind(model)
            .bind(vector)
            .bind(limit.clamp(1, 50))
            .bind(candidate_limit)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?;

        rows.into_iter()
            .map(|row| {
                Ok(SemanticSearchResult {
                    workspace_id: row.workspace_id,
                    workspace_name: row.workspace_name,
                    page_id: row.page_id,
                    page_title: row.page_title,
                    page_icon: row.page_icon,
                    block_id: row.block_id,
                    block_type: parse_block_type(&row.block_type)?,
                    text: row.text,
                    score: row.score,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vector_literal_rejects_invalid_values() {
        assert!(halfvec_literal(&[], 2).is_err());
        assert!(halfvec_literal(&[1.0], 2).is_err());
        assert!(halfvec_literal(&[1.0, f32::INFINITY], 2).is_err());
        assert!(halfvec_literal(&[1.0, 65_505.0], 2).is_err());
        assert_eq!(halfvec_literal(&[1.0, -2.5], 2).unwrap(), "[1,-2.5]");
    }

    #[test]
    fn nearest_neighbor_stage_is_permission_filtered_before_resolution() {
        let nearest_end = SEMANTIC_SEARCH_SQL.find("), candidates AS").unwrap();
        let nearest = &SEMANTIC_SEARCH_SQL[..nearest_end];

        assert!(nearest.contains("e.workspace_id = $2 AND e.model = $3"));
        assert!(nearest.contains("workspace_members"));
        assert!(nearest.contains("ORDER BY e.embedding <=> $4::halfvec(3072)\n     LIMIT $6"));
        assert!(!nearest.contains("ancestors"));
        assert!(SEMANTIC_SEARCH_SQL[nearest_end..].contains("a.trashed"));
    }

    #[test]
    fn concurrent_hnsw_migration_is_not_transactional_or_partial() {
        let migration = include_str!("../../../migrations/0014_block_embeddings_cosine_index.sql");
        assert!(migration.starts_with("-- no-transaction\n"));
        assert!(migration.contains("CREATE INDEX CONCURRENTLY"));
        assert!(!migration.to_ascii_lowercase().contains(" where "));
    }
}
