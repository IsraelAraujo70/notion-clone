use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::integration::{
    CreateIntegrationTokenRecord, IntegrationPrincipal, IntegrationRepository, IntegrationScope,
    IntegrationToken,
};

#[derive(Debug, Clone)]
pub struct PostgresIntegrationRepository {
    pool: PgPool,
}

impl PostgresIntegrationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(sqlx::FromRow)]
struct IntegrationTokenRow {
    id: Uuid,
    name: String,
    scopes: Vec<String>,
    workspace_ids: Vec<Uuid>,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

fn parse_scopes(values: Vec<String>) -> Result<Vec<IntegrationScope>, RepositoryError> {
    values
        .into_iter()
        .map(|value| IntegrationScope::parse(&value).ok_or(RepositoryError::Unexpected))
        .collect()
}

fn map_token(row: IntegrationTokenRow) -> Result<IntegrationToken, RepositoryError> {
    Ok(IntegrationToken {
        id: row.id,
        name: row.name,
        scopes: parse_scopes(row.scopes)?,
        workspace_ids: row.workspace_ids,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        last_used_at: row.last_used_at,
        created_at: row.created_at,
    })
}

const TOKEN_SELECT: &str = "SELECT t.id, t.name, t.scopes, t.expires_at, t.revoked_at,
    t.last_used_at, t.created_at,
    COALESCE(array_agg(g.workspace_id ORDER BY g.workspace_id)
        FILTER (WHERE g.workspace_id IS NOT NULL), ARRAY[]::uuid[]) AS workspace_ids
 FROM integration_tokens t
 LEFT JOIN integration_token_workspaces g ON g.token_id = t.id";

#[async_trait]
impl IntegrationRepository for PostgresIntegrationRepository {
    async fn create_token(
        &self,
        input: CreateIntegrationTokenRecord,
    ) -> Result<IntegrationToken, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let scopes = input
            .scopes
            .iter()
            .map(|scope| scope.as_str())
            .collect::<Vec<_>>();
        sqlx::query(
            "INSERT INTO integration_tokens
                (id, user_id, name, token_hash, scopes, expires_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(input.id)
        .bind(input.user_id)
        .bind(&input.name)
        .bind(&input.token_hash)
        .bind(scopes)
        .bind(input.expires_at)
        .bind(input.created_at)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        for workspace_id in &input.workspace_ids {
            sqlx::query(
                "INSERT INTO integration_token_workspaces (token_id, workspace_id)
                 VALUES ($1, $2)",
            )
            .bind(input.id)
            .bind(workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(IntegrationToken {
            id: input.id,
            name: input.name,
            scopes: input.scopes,
            workspace_ids: input.workspace_ids,
            expires_at: input.expires_at,
            revoked_at: None,
            last_used_at: None,
            created_at: input.created_at,
        })
    }

    async fn list_tokens(&self, user_id: Uuid) -> Result<Vec<IntegrationToken>, RepositoryError> {
        let query = format!(
            "{TOKEN_SELECT} WHERE t.user_id = $1
             GROUP BY t.id ORDER BY t.created_at DESC"
        );
        sqlx::query_as::<_, IntegrationTokenRow>(&query)
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?
            .into_iter()
            .map(map_token)
            .collect()
    }

    async fn revoke_token(
        &self,
        user_id: Uuid,
        token_id: Uuid,
        revoked_at: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        sqlx::query(
            "UPDATE integration_tokens SET revoked_at = $3
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
        )
        .bind(token_id)
        .bind(user_id)
        .bind(revoked_at)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected() == 1)
        .map_err(map_sqlx_error)
    }

    async fn find_principal_by_hash(
        &self,
        token_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<IntegrationPrincipal>, RepositoryError> {
        #[derive(sqlx::FromRow)]
        struct PrincipalRow {
            token_id: Uuid,
            user_id: Uuid,
            scopes: Vec<String>,
            workspace_ids: Vec<Uuid>,
        }

        let row = sqlx::query_as::<_, PrincipalRow>(
            "WITH valid AS MATERIALIZED (
                 SELECT id, user_id, scopes
                 FROM integration_tokens
                 WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
             ), touched AS (
                 UPDATE integration_tokens t
                 SET last_used_at = $2
                 FROM valid v
                 WHERE t.id = v.id
                   AND (t.last_used_at IS NULL OR t.last_used_at < $2 - interval '5 minutes')
             )
             SELECT v.id AS token_id, v.user_id, v.scopes,
                    array_agg(g.workspace_id ORDER BY g.workspace_id) AS workspace_ids
             FROM valid v
             JOIN integration_token_workspaces g ON g.token_id = v.id
             GROUP BY v.id, v.user_id, v.scopes",
        )
        .bind(token_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        row.map(|row| {
            Ok(IntegrationPrincipal {
                token_id: row.token_id,
                user_id: row.user_id,
                scopes: parse_scopes(row.scopes)?,
                workspace_ids: row.workspace_ids,
            })
        })
        .transpose()
    }
}
