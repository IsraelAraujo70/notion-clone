use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::adapters::postgres::tx::map_sqlx_error;
use crate::application::ports::RepositoryError;
use crate::application::ports::google_calendar::{
    AppliedGoogleCalendarSync, CreateGoogleOAuthState, EncryptedSecret, GoogleCalendarRepository,
    GoogleCalendarSyncJob, GoogleConnectionSecret, LinkGoogleCalendarEvent, ManualCalendarRow,
    PendingGoogleOAuthState, ProjectedExternalCalendarEvent, ReplaceGoogleCalendarSources,
    SaveGoogleConnection,
};
use crate::domain::error::DomainError;
use crate::domain::google_calendar::{
    GoogleCalendarConnection, GoogleCalendarEventLink, GoogleCalendarSource,
};

const INVALID_DATABASE: &str = "Calendar target must be a live database in this workspace";
const INVALID_LINK_ROW: &str = "Calendar notes row must belong to this database";
const ROW_ALREADY_LINKED: &str = "Calendar notes row is already linked to another event";

#[derive(Debug, Clone)]
pub struct PostgresGoogleCalendarRepository {
    pool: PgPool,
}

impl PostgresGoogleCalendarRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct ConnectionRow {
    id: Uuid,
    google_account_id: String,
    account_email: String,
    granted_scopes: Vec<String>,
    connected_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
}

impl From<ConnectionRow> for GoogleCalendarConnection {
    fn from(row: ConnectionRow) -> Self {
        Self {
            id: row.id,
            google_account_id: row.google_account_id,
            account_email: row.account_email,
            granted_scopes: row.granted_scopes,
            connected_at: row.connected_at,
            revoked_at: row.revoked_at,
        }
    }
}

#[derive(FromRow)]
struct SourceRow {
    id: Uuid,
    workspace_id: Uuid,
    database_block_id: Uuid,
    connection_id: Uuid,
    google_calendar_id: String,
    display_name: String,
    color: Option<String>,
    enabled: bool,
    last_synced_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
}

impl From<SourceRow> for GoogleCalendarSource {
    fn from(row: SourceRow) -> Self {
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            database_block_id: row.database_block_id,
            connection_id: row.connection_id,
            google_calendar_id: row.google_calendar_id,
            display_name: row.display_name,
            color: row.color,
            enabled: row.enabled,
            last_synced_at: row.last_synced_at,
            last_error: row.last_error,
        }
    }
}

#[derive(FromRow)]
struct ProjectionRow {
    row_id: Option<Uuid>,
    source_id: Uuid,
    google_event_id: String,
    title: String,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    time_zone: Option<String>,
    all_day: bool,
    status: String,
    meet_url: Option<String>,
    location: Option<String>,
    google_url: Option<String>,
    color: Option<String>,
    private: bool,
}

impl From<ProjectionRow> for ProjectedExternalCalendarEvent {
    fn from(row: ProjectionRow) -> Self {
        Self {
            row_id: row.row_id,
            source_id: row.source_id,
            google_event_id: row.google_event_id,
            title: row.title,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            start_date: row.start_date,
            end_date: row.end_date,
            time_zone: row.time_zone,
            all_day: row.all_day,
            status: row.status,
            meet_url: row.meet_url,
            location: row.location,
            google_url: row.google_url,
            color: row.color,
            private: row.private,
        }
    }
}

#[derive(FromRow)]
struct LinkRow {
    id: Uuid,
    workspace_id: Uuid,
    database_block_id: Uuid,
    database_row_id: Uuid,
    source_id: Uuid,
    google_event_id: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<LinkRow> for GoogleCalendarEventLink {
    fn from(row: LinkRow) -> Self {
        Self {
            id: row.id,
            workspace_id: row.workspace_id,
            database_block_id: row.database_block_id,
            database_row_id: row.database_row_id,
            source_id: row.source_id,
            google_event_id: row.google_event_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(FromRow)]
struct SyncJobRow {
    workspace_id: Uuid,
    source_id: Uuid,
    user_id: Uuid,
    connection_id: Uuid,
    google_calendar_id: String,
    sync_from: DateTime<Utc>,
    refresh_token_ciphertext: String,
    encryption_key_id: String,
    next_sync_token: Option<String>,
    channel_id: Option<String>,
    resource_id: Option<String>,
    channel_expires_at: Option<DateTime<Utc>>,
    attempts: i32,
    lease_token: Uuid,
}

impl From<SyncJobRow> for GoogleCalendarSyncJob {
    fn from(row: SyncJobRow) -> Self {
        Self {
            workspace_id: row.workspace_id,
            source_id: row.source_id,
            user_id: row.user_id,
            connection_id: row.connection_id,
            calendar_id: row.google_calendar_id,
            sync_from: row.sync_from,
            refresh_token: EncryptedSecret {
                key_id: row.encryption_key_id,
                ciphertext: row.refresh_token_ciphertext,
            },
            next_sync_token: row.next_sync_token,
            channel_id: row.channel_id,
            resource_id: row.resource_id,
            channel_expires_at: row.channel_expires_at,
            attempts: row.attempts,
            lease_token: row.lease_token,
        }
    }
}

async fn validate_database(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: Uuid,
    database_id: Uuid,
) -> Result<(), RepositoryError> {
    let valid = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
             SELECT 1 FROM blocks
             WHERE id = $1 AND workspace_id = $2
               AND type = 'database' AND trashed_at IS NULL
         )",
    )
    .bind(database_id)
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_sqlx_error)?;
    if valid {
        Ok(())
    } else {
        Err(DomainError::Validation(INVALID_DATABASE).into())
    }
}

async fn find_link_by_op(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: Uuid,
    op_id: Uuid,
) -> Result<Option<LinkRow>, RepositoryError> {
    sqlx::query_as::<_, LinkRow>(
        "SELECT id, workspace_id, database_block_id, database_row_id, source_id,
                google_event_id, created_at, updated_at
         FROM google_calendar_event_links
         WHERE workspace_id = $1 AND op_id = $2",
    )
    .bind(workspace_id)
    .bind(op_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_sqlx_error)
}

#[async_trait]
impl GoogleCalendarRepository for PostgresGoogleCalendarRepository {
    async fn find_database_page(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
    ) -> Result<Option<Uuid>, RepositoryError> {
        sqlx::query_scalar::<_, Uuid>(
            "WITH RECURSIVE ancestors AS (
                 SELECT id, parent_id, type, 0 AS depth
                 FROM blocks
                 WHERE id = $1 AND workspace_id = $2
                   AND type = 'database' AND trashed_at IS NULL
                 UNION ALL
                 SELECT parent.id, parent.parent_id, parent.type, child.depth + 1
                 FROM ancestors child
                 JOIN blocks parent
                   ON parent.id = child.parent_id AND parent.workspace_id = $2
                 WHERE parent.trashed_at IS NULL AND child.depth < 100
             )
             SELECT id FROM ancestors
             WHERE type IN ('page', 'database_row') AND depth > 0
             ORDER BY depth LIMIT 1",
        )
        .bind(database_id)
        .bind(workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)
    }

    async fn create_oauth_state(
        &self,
        input: CreateGoogleOAuthState,
    ) -> Result<(), RepositoryError> {
        let result = sqlx::query(
            "WITH stale AS (
                 DELETE FROM google_calendar_oauth_states
                 WHERE expires_at <= $10 OR consumed_at IS NOT NULL
             )
             INSERT INTO google_calendar_oauth_states
                (id, workspace_id, user_id, state_hash, pkce_verifier_ciphertext,
                 encryption_key_id, return_database_id, return_page_id, expires_at, created_at)
             SELECT $1, $2, $3, $4, $5, $6, database.id, $8, $9, $10
             FROM blocks database
             WHERE database.id = $7 AND database.workspace_id = $2
               AND database.type = 'database' AND database.trashed_at IS NULL",
        )
        .bind(input.id)
        .bind(input.workspace_id)
        .bind(input.user_id)
        .bind(input.state_hash)
        .bind(input.verifier.ciphertext)
        .bind(input.verifier.key_id)
        .bind(input.return_database_id)
        .bind(input.return_page_id)
        .bind(input.expires_at)
        .bind(input.created_at)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() == 1 {
            Ok(())
        } else {
            Err(RepositoryError::NotFound)
        }
    }

    async fn consume_oauth_state(
        &self,
        state_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<PendingGoogleOAuthState>, RepositoryError> {
        sqlx::query_as::<_, (Uuid, Uuid, String, String, Uuid, Uuid)>(
            "UPDATE google_calendar_oauth_states
             SET consumed_at = $2
             WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2
             RETURNING workspace_id, user_id, pkce_verifier_ciphertext,
                       encryption_key_id, return_database_id, return_page_id",
        )
        .bind(state_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map(|row| {
            row.map(
                |(
                    workspace_id,
                    user_id,
                    ciphertext,
                    key_id,
                    return_database_id,
                    return_page_id,
                )| {
                    PendingGoogleOAuthState {
                        workspace_id,
                        user_id,
                        verifier: EncryptedSecret { key_id, ciphertext },
                        return_database_id,
                        return_page_id,
                    }
                },
            )
        })
        .map_err(map_sqlx_error)
    }

    async fn save_connection(
        &self,
        input: SaveGoogleConnection,
    ) -> Result<GoogleCalendarConnection, RepositoryError> {
        sqlx::query_as::<_, ConnectionRow>(
            "INSERT INTO google_calendar_connections
                (id, user_id, google_account_id, account_email, refresh_token_ciphertext,
                 encryption_key_id, granted_scopes, connected_at, revoked_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
             ON CONFLICT (user_id, google_account_id) DO UPDATE SET
                account_email = EXCLUDED.account_email,
                refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
                encryption_key_id = EXCLUDED.encryption_key_id,
                granted_scopes = EXCLUDED.granted_scopes,
                connected_at = EXCLUDED.connected_at,
                revoked_at = NULL
             RETURNING id, google_account_id, account_email, granted_scopes,
                       connected_at, revoked_at",
        )
        .bind(input.id)
        .bind(input.user_id)
        .bind(input.google_account_id)
        .bind(input.account_email)
        .bind(input.refresh_token.ciphertext)
        .bind(input.refresh_token.key_id)
        .bind(input.granted_scopes)
        .bind(input.connected_at)
        .fetch_one(&self.pool)
        .await
        .map(Into::into)
        .map_err(map_sqlx_error)
    }

    async fn list_connections(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<GoogleCalendarConnection>, RepositoryError> {
        sqlx::query_as::<_, ConnectionRow>(
            "SELECT id, google_account_id, account_email, granted_scopes,
                    connected_at, revoked_at
             FROM google_calendar_connections
             WHERE user_id = $1 ORDER BY connected_at DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn find_connection_secret(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
    ) -> Result<Option<GoogleConnectionSecret>, RepositoryError> {
        sqlx::query_as::<_, (Uuid, Uuid, String, String)>(
            "SELECT id, user_id, refresh_token_ciphertext, encryption_key_id
             FROM google_calendar_connections
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
        )
        .bind(connection_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map(|row| {
            row.map(|(id, user_id, ciphertext, key_id)| GoogleConnectionSecret {
                id,
                user_id,
                refresh_token: EncryptedSecret { key_id, ciphertext },
            })
        })
        .map_err(map_sqlx_error)
    }

    async fn disconnect_connection(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let disconnected = sqlx::query_scalar::<_, Uuid>(
            "UPDATE google_calendar_connections
             SET refresh_token_ciphertext = NULL, encryption_key_id = NULL, revoked_at = $3
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
             RETURNING id",
        )
        .bind(connection_id)
        .bind(user_id)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        .is_some();
        if disconnected {
            sqlx::query(
                "UPDATE google_calendar_sources
                 SET enabled = FALSE, updated_at = $3
                 WHERE connection_id = $1 AND user_id = $2",
            )
            .bind(connection_id)
            .bind(user_id)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
            sqlx::query(
                "DELETE FROM google_calendar_events events
                 USING google_calendar_sources sources
                 WHERE events.workspace_id = sources.workspace_id
                   AND events.source_id = sources.id
                   AND sources.connection_id = $1 AND sources.user_id = $2",
            )
            .bind(connection_id)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
            sqlx::query(
                "UPDATE google_calendar_sync_states state
                 SET next_sync_token = NULL, channel_id = NULL, webhook_token_hash = NULL,
                     resource_id = NULL, channel_expires_at = NULL,
                     lease_token = NULL, leased_until = NULL
                 FROM google_calendar_sources sources
                 WHERE state.workspace_id = sources.workspace_id
                   AND state.source_id = sources.id
                   AND sources.connection_id = $1 AND sources.user_id = $2",
            )
            .bind(connection_id)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(disconnected)
    }

    async fn list_sources(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<GoogleCalendarSource>, RepositoryError> {
        sqlx::query_as::<_, SourceRow>(
            "SELECT source.id, source.workspace_id, source.database_block_id,
                    source.connection_id, source.google_calendar_id, source.display_name,
                    source.color, source.enabled, state.last_synced_at, state.last_error
             FROM google_calendar_sources source
             LEFT JOIN google_calendar_sync_states state
               ON state.workspace_id = source.workspace_id AND state.source_id = source.id
             WHERE source.workspace_id = $1 AND source.database_block_id = $2
               AND source.user_id = $3
             ORDER BY source.display_name, source.google_calendar_id",
        )
        .bind(workspace_id)
        .bind(database_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn replace_sources(
        &self,
        input: ReplaceGoogleCalendarSources,
    ) -> Result<Vec<GoogleCalendarSource>, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        validate_database(&mut tx, input.workspace_id, input.database_block_id).await?;
        let mut selected_ids = Vec::with_capacity(input.sources.len());
        for source in input.sources {
            let id = sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO google_calendar_sources
                    (id, workspace_id, database_block_id, connection_id, user_id,
                     google_calendar_id, display_name, color, enabled, sync_from,
                     created_at, updated_at)
                 SELECT $1, $2, $3, connection.id, $4, $6, $7, $8, TRUE, $9, $10, $10
                 FROM google_calendar_connections connection
                 WHERE connection.id = $5 AND connection.user_id = $4
                   AND connection.revoked_at IS NULL
                 ON CONFLICT (workspace_id, database_block_id, user_id, connection_id, google_calendar_id)
                 DO UPDATE SET display_name = EXCLUDED.display_name,
                               color = EXCLUDED.color,
                               enabled = TRUE,
                               updated_at = EXCLUDED.updated_at
                 RETURNING id",
            )
            .bind(source.id)
            .bind(input.workspace_id)
            .bind(input.database_block_id)
            .bind(input.user_id)
            .bind(source.connection_id)
            .bind(source.google_calendar_id)
            .bind(source.display_name)
            .bind(source.color)
            .bind(input.sync_from)
            .bind(input.now)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            .ok_or(DomainError::Forbidden)?;
            selected_ids.push(id);
            sqlx::query(
                "INSERT INTO google_calendar_sync_states
                    (workspace_id, source_id, next_attempt_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (workspace_id, source_id) DO UPDATE SET
                    next_attempt_at = LEAST(google_calendar_sync_states.next_attempt_at, $3)",
            )
            .bind(input.workspace_id)
            .bind(id)
            .bind(input.now)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        let disabled = sqlx::query_scalar::<_, Uuid>(
            "UPDATE google_calendar_sources
             SET enabled = FALSE, updated_at = $4
             WHERE workspace_id = $1 AND database_block_id = $2 AND user_id = $3
               AND NOT (id = ANY($5)) AND enabled
             RETURNING id",
        )
        .bind(input.workspace_id)
        .bind(input.database_block_id)
        .bind(input.user_id)
        .bind(input.now)
        .bind(&selected_ids)
        .fetch_all(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if !disabled.is_empty() {
            sqlx::query(
                "DELETE FROM google_calendar_events
                 WHERE workspace_id = $1 AND source_id = ANY($2)",
            )
            .bind(input.workspace_id)
            .bind(&disabled)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
            sqlx::query(
                "UPDATE google_calendar_sync_states
                 SET next_sync_token = NULL, channel_id = NULL, webhook_token_hash = NULL,
                     resource_id = NULL, channel_expires_at = NULL,
                     lease_token = NULL, leased_until = NULL
                 WHERE workspace_id = $1 AND source_id = ANY($2)",
            )
            .bind(input.workspace_id)
            .bind(&disabled)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        let rows = sqlx::query_as::<_, SourceRow>(
            "SELECT source.id, source.workspace_id, source.database_block_id,
                    source.connection_id, source.google_calendar_id, source.display_name,
                    source.color, source.enabled, state.last_synced_at, state.last_error
             FROM google_calendar_sources source
             LEFT JOIN google_calendar_sync_states state
               ON state.workspace_id = source.workspace_id AND state.source_id = source.id
             WHERE source.workspace_id = $1 AND source.database_block_id = $2
               AND source.user_id = $3 AND source.enabled
             ORDER BY source.display_name, source.google_calendar_id",
        )
        .bind(input.workspace_id)
        .bind(input.database_block_id)
        .bind(input.user_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn list_external_events(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        user_id: Uuid,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        time_zone: &str,
    ) -> Result<Vec<ProjectedExternalCalendarEvent>, RepositoryError> {
        sqlx::query_as::<_, ProjectionRow>(
            "WITH bounds AS (
                 SELECT ($4::TIMESTAMPTZ AT TIME ZONE $6)::DATE AS start_date,
                        ($5::TIMESTAMPTZ AT TIME ZONE $6)::DATE AS end_date
             ), linked AS (
                 SELECT link.database_row_id AS row_id, link.source_id,
                        link.google_event_id,
                        COALESCE(event.title, link.snapshot_title) AS title,
                        COALESCE(event.starts_at, link.snapshot_starts_at) AS starts_at,
                        COALESCE(event.ends_at, link.snapshot_ends_at) AS ends_at,
                        COALESCE(event.start_date, link.snapshot_start_date) AS start_date,
                        COALESCE(event.end_date, link.snapshot_end_date) AS end_date,
                        COALESCE(event.time_zone, link.snapshot_time_zone) AS time_zone,
                        COALESCE(event.all_day, link.snapshot_all_day) AS all_day,
                        COALESCE(event.status, link.snapshot_status) AS status,
                        COALESCE(event.meet_url, link.snapshot_meet_url) AS meet_url,
                        NULL::TEXT AS location,
                        COALESCE(event.google_url, link.snapshot_google_url) AS google_url,
                        source.color, FALSE AS private
                 FROM google_calendar_event_links link
                 JOIN google_calendar_sources source
                   ON source.id = link.source_id AND source.workspace_id = link.workspace_id
                 LEFT JOIN google_calendar_events event
                   ON event.workspace_id = link.workspace_id
                  AND event.source_id = link.source_id
                  AND event.google_event_id = link.google_event_id
                 CROSS JOIN bounds
                 WHERE link.workspace_id = $1 AND link.database_block_id = $2
                   AND CASE WHEN COALESCE(event.all_day, link.snapshot_all_day)
                     THEN COALESCE(event.start_date, link.snapshot_start_date) < bounds.end_date
                      AND COALESCE(event.end_date, link.snapshot_end_date) > bounds.start_date
                     ELSE COALESCE(event.starts_at, link.snapshot_starts_at) < $5
                      AND COALESCE(event.ends_at, link.snapshot_ends_at) > $4
                   END
             ), private_events AS (
                 SELECT NULL::UUID AS row_id, event.source_id, event.google_event_id,
                        event.title, event.starts_at, event.ends_at, event.start_date,
                        event.end_date, event.time_zone, event.all_day, event.status,
                        event.meet_url, event.location, event.google_url, source.color,
                        TRUE AS private
                 FROM google_calendar_events event
                 JOIN google_calendar_sources source
                   ON source.id = event.source_id AND source.workspace_id = event.workspace_id
                 LEFT JOIN google_calendar_event_links link
                   ON link.workspace_id = event.workspace_id
                  AND link.database_block_id = source.database_block_id
                  AND link.source_id = event.source_id
                  AND link.google_event_id = event.google_event_id
                 CROSS JOIN bounds
                 WHERE event.workspace_id = $1 AND source.database_block_id = $2
                   AND source.user_id = $3 AND source.enabled
                   AND link.id IS NULL
                   AND CASE WHEN event.all_day
                     THEN event.start_date < bounds.end_date
                      AND event.end_date > bounds.start_date
                     ELSE event.starts_at < $5 AND event.ends_at > $4
                   END
             )
             SELECT * FROM linked
             UNION ALL
             SELECT * FROM private_events
             ORDER BY starts_at, title",
        )
        .bind(workspace_id)
        .bind(database_id)
        .bind(user_id)
        .bind(start)
        .bind(end)
        .bind(time_zone)
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn list_manual_rows(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
    ) -> Result<Vec<ManualCalendarRow>, RepositoryError> {
        let date_property_id = sqlx::query_scalar::<_, Option<String>>(
            "SELECT COALESCE(
                 NULLIF(properties #>> '{calendar,datePropertyId}', ''),
                 (SELECT property ->> 'id'
                  FROM jsonb_array_elements(COALESCE(properties -> 'schema', '[]'::jsonb)) property
                  WHERE property ->> 'type' = 'date' LIMIT 1)
             )
             FROM blocks
             WHERE id = $1 AND workspace_id = $2
               AND type = 'database' AND trashed_at IS NULL",
        )
        .bind(database_id)
        .bind(workspace_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?
        .flatten();
        let Some(date_property_id) = date_property_id else {
            return Ok(Vec::new());
        };
        sqlx::query_as::<_, (Uuid, String, Value)>(
            "SELECT id, COALESCE(properties ->> 'title', ''), properties
             FROM blocks
             WHERE workspace_id = $1 AND parent_id = $2
               AND type = 'database_row' AND trashed_at IS NULL
               AND properties ? $3",
        )
        .bind(workspace_id)
        .bind(database_id)
        .bind(&date_property_id)
        .fetch_all(&self.pool)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(row_id, title, properties)| ManualCalendarRow {
                    row_id,
                    title,
                    properties,
                    date_property_id: date_property_id.clone(),
                })
                .collect()
        })
        .map_err(map_sqlx_error)
    }

    async fn link_event(
        &self,
        input: LinkGoogleCalendarEvent,
    ) -> Result<GoogleCalendarEventLink, RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        if let Some(existing) = find_link_by_op(&mut tx, input.workspace_id, input.op_id).await? {
            tx.commit().await.map_err(map_sqlx_error)?;
            return Ok(existing.into());
        }
        let row_valid = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                 SELECT 1 FROM blocks row
                 JOIN blocks database
                   ON database.id = row.parent_id AND database.workspace_id = row.workspace_id
                 WHERE row.id = $1 AND row.workspace_id = $2
                   AND row.type = 'database_row' AND row.trashed_at IS NULL
                   AND database.id = $3 AND database.type = 'database'
                   AND database.trashed_at IS NULL
             )",
        )
        .bind(input.database_row_id)
        .bind(input.workspace_id)
        .bind(input.database_block_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if !row_valid {
            return Err(DomainError::Validation(INVALID_LINK_ROW).into());
        }
        sqlx::query("SELECT id FROM blocks WHERE id = $1 AND workspace_id = $2 FOR UPDATE")
            .bind(input.database_row_id)
            .bind(input.workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        if let Some(existing) = sqlx::query_as::<_, LinkRow>(
            "SELECT id, workspace_id, database_block_id, database_row_id, source_id,
                    google_event_id, created_at, updated_at
             FROM google_calendar_event_links
             WHERE workspace_id = $1 AND database_block_id = $2 AND database_row_id = $3",
        )
        .bind(input.workspace_id)
        .bind(input.database_block_id)
        .bind(input.database_row_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?
        {
            if existing.source_id == input.source_id
                && existing.google_event_id == input.google_event_id
            {
                tx.commit().await.map_err(map_sqlx_error)?;
                return Ok(existing.into());
            }
            return Err(DomainError::Validation(ROW_ALREADY_LINKED).into());
        }
        let inserted = sqlx::query_as::<_, LinkRow>(
            "INSERT INTO google_calendar_event_links
                (id, op_id, workspace_id, database_block_id, database_row_id,
                 source_id, google_event_id, snapshot_title, snapshot_starts_at,
                 snapshot_ends_at, snapshot_start_date, snapshot_end_date,
                 snapshot_time_zone, snapshot_all_day, snapshot_status,
                 snapshot_meet_url, snapshot_google_url, linked_by, created_at, updated_at)
             SELECT $1, $2, event.workspace_id, source.database_block_id, $4,
                    event.source_id, event.google_event_id, event.title, event.starts_at,
                    event.ends_at, event.start_date, event.end_date, event.time_zone,
                    event.all_day, event.status, event.meet_url, event.google_url, $7, $8, $8
             FROM google_calendar_events event
             JOIN google_calendar_sources source
               ON source.id = event.source_id AND source.workspace_id = event.workspace_id
             WHERE event.workspace_id = $3 AND source.database_block_id = $5
               AND source.user_id = $7 AND source.enabled
               AND event.source_id = $6 AND event.google_event_id = $9
             ON CONFLICT (workspace_id, database_block_id, source_id, google_event_id)
             DO NOTHING
             RETURNING id, workspace_id, database_block_id, database_row_id, source_id,
                       google_event_id, created_at, updated_at",
        )
        .bind(input.id)
        .bind(input.op_id)
        .bind(input.workspace_id)
        .bind(input.database_row_id)
        .bind(input.database_block_id)
        .bind(input.source_id)
        .bind(input.linked_by)
        .bind(input.now)
        .bind(&input.google_event_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        let link = match inserted {
            Some(link) => link,
            None => sqlx::query_as::<_, LinkRow>(
                "SELECT id, workspace_id, database_block_id, database_row_id, source_id,
                        google_event_id, created_at, updated_at
                 FROM google_calendar_event_links
                 WHERE workspace_id = $1 AND database_block_id = $2
                   AND source_id = $3 AND google_event_id = $4",
            )
            .bind(input.workspace_id)
            .bind(input.database_block_id)
            .bind(input.source_id)
            .bind(input.google_event_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx_error)?
            .ok_or(RepositoryError::NotFound)?,
        };
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(link.into())
    }

    async fn unlink_event(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        row_id: Uuid,
    ) -> Result<bool, RepositoryError> {
        sqlx::query(
            "DELETE FROM google_calendar_event_links
             WHERE workspace_id = $1 AND database_block_id = $2 AND database_row_id = $3",
        )
        .bind(workspace_id)
        .bind(database_id)
        .bind(row_id)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected() == 1)
        .map_err(map_sqlx_error)
    }

    async fn claim_due_sync_jobs(
        &self,
        now: DateTime<Utc>,
        lease_until: DateTime<Utc>,
        limit: i64,
    ) -> Result<Vec<GoogleCalendarSyncJob>, RepositoryError> {
        sqlx::query_as::<_, SyncJobRow>(
            "WITH candidates AS (
                 SELECT state.workspace_id, state.source_id
                 FROM google_calendar_sync_states state
                 JOIN google_calendar_sources source
                   ON source.id = state.source_id AND source.workspace_id = state.workspace_id
                 JOIN google_calendar_connections connection
                   ON connection.id = source.connection_id AND connection.user_id = source.user_id
                 WHERE source.enabled AND connection.revoked_at IS NULL
                   AND connection.refresh_token_ciphertext IS NOT NULL
                   AND state.next_attempt_at <= $1
                   AND (state.lease_token IS NULL OR state.leased_until <= $1)
                 ORDER BY state.next_attempt_at
                 FOR UPDATE OF state SKIP LOCKED
                 LIMIT $3
             ), claimed AS (
                 UPDATE google_calendar_sync_states state
                 SET lease_token = gen_random_uuid(), leased_until = $2
                 FROM candidates candidate
                 WHERE state.workspace_id = candidate.workspace_id
                   AND state.source_id = candidate.source_id
                 RETURNING state.workspace_id, state.source_id, state.next_sync_token,
                           state.channel_id, state.resource_id, state.channel_expires_at,
                           state.attempts, state.lease_token
             )
             SELECT claimed.workspace_id, claimed.source_id, source.user_id,
                    source.connection_id, source.google_calendar_id, source.sync_from,
                    connection.refresh_token_ciphertext, connection.encryption_key_id,
                    claimed.next_sync_token, claimed.channel_id, claimed.resource_id,
                    claimed.channel_expires_at, claimed.attempts, claimed.lease_token
             FROM claimed
             JOIN google_calendar_sources source
               ON source.id = claimed.source_id AND source.workspace_id = claimed.workspace_id
             JOIN google_calendar_connections connection
               ON connection.id = source.connection_id AND connection.user_id = source.user_id",
        )
        .bind(now)
        .bind(lease_until)
        .bind(limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(map_sqlx_error)
    }

    async fn apply_sync(&self, input: AppliedGoogleCalendarSync) -> Result<(), RepositoryError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;
        let leased = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                 SELECT 1 FROM google_calendar_sync_states
                 WHERE workspace_id = $1 AND source_id = $2 AND lease_token = $3
             )",
        )
        .bind(input.workspace_id)
        .bind(input.source_id)
        .bind(input.lease_token)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if !leased {
            return Err(RepositoryError::Unexpected);
        }
        if input.full_sync {
            sqlx::query(
                "DELETE FROM google_calendar_events
                 WHERE workspace_id = $1 AND source_id = $2",
            )
            .bind(input.workspace_id)
            .bind(input.source_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }
        let events = Value::Array(
            input
                .events
                .iter()
                .map(|event| {
                    let range = event.range.as_ref();
                    json!({
                        "id": event.id,
                        "ical_uid": event.ical_uid,
                        "recurring_event_id": event.recurring_event_id,
                        "original_start_at": event.original_start_at,
                        "title": event.title,
                        "starts_at": range.map(|value| value.start.to_rfc3339()),
                        "ends_at": range.map(|value| value.end.to_rfc3339()),
                        "start_date": range.and_then(|value| value.start_date),
                        "end_date": range.and_then(|value| value.end_date),
                        "time_zone": range.and_then(|value| value.time_zone.clone()),
                        "all_day": range.map(|value| value.all_day),
                        "status": event.status,
                        "meet_url": event.meet_url,
                        "location": event.location,
                        "google_url": event.google_url,
                        "etag": event.etag,
                        "updated_at": event.updated_at,
                    })
                })
                .collect(),
        );
        sqlx::query(
            "WITH incoming AS (
                 SELECT * FROM jsonb_to_recordset($3) AS event(
                     id TEXT, ical_uid TEXT, recurring_event_id TEXT,
                     original_start_at TEXT, title TEXT, starts_at TIMESTAMPTZ,
                     ends_at TIMESTAMPTZ, start_date DATE, end_date DATE,
                     time_zone TEXT, all_day BOOLEAN, status TEXT, meet_url TEXT,
                     location TEXT, google_url TEXT, etag TEXT, updated_at TIMESTAMPTZ)
             )
             INSERT INTO google_calendar_events
                (workspace_id, source_id, google_event_id, ical_uid, recurring_event_id,
                 original_start_at, title, starts_at, ends_at, start_date, end_date,
                 time_zone, all_day, status, meet_url, location, google_url, etag,
                 google_updated_at, cached_at)
             SELECT $1, $2, id, ical_uid, recurring_event_id, original_start_at,
                    title, starts_at, ends_at, start_date, end_date, time_zone,
                    all_day, status, meet_url, location, google_url, etag, updated_at, $4
             FROM incoming WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL
             ON CONFLICT (workspace_id, source_id, google_event_id) DO UPDATE SET
                ical_uid = EXCLUDED.ical_uid,
                recurring_event_id = EXCLUDED.recurring_event_id,
                original_start_at = EXCLUDED.original_start_at,
                title = EXCLUDED.title,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                time_zone = EXCLUDED.time_zone,
                all_day = EXCLUDED.all_day,
                status = EXCLUDED.status,
                meet_url = EXCLUDED.meet_url,
                location = EXCLUDED.location,
                google_url = EXCLUDED.google_url,
                etag = EXCLUDED.etag,
                google_updated_at = EXCLUDED.google_updated_at,
                cached_at = EXCLUDED.cached_at",
        )
        .bind(input.workspace_id)
        .bind(input.source_id)
        .bind(&events)
        .bind(input.now)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        sqlx::query(
            "WITH incoming AS (
                 SELECT * FROM jsonb_to_recordset($3) AS event(
                     id TEXT, starts_at TIMESTAMPTZ, status TEXT)
             )
             UPDATE google_calendar_events stored
             SET status = incoming.status, cached_at = $4
             FROM incoming
             WHERE stored.workspace_id = $1 AND stored.source_id = $2
               AND stored.google_event_id = incoming.id
               AND incoming.starts_at IS NULL AND incoming.status = 'cancelled'",
        )
        .bind(input.workspace_id)
        .bind(input.source_id)
        .bind(&events)
        .bind(input.now)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        sqlx::query(
            "UPDATE google_calendar_event_links link
             SET snapshot_title = event.title,
                 snapshot_starts_at = event.starts_at,
                 snapshot_ends_at = event.ends_at,
                 snapshot_start_date = event.start_date,
                 snapshot_end_date = event.end_date,
                 snapshot_time_zone = event.time_zone,
                 snapshot_all_day = event.all_day,
                 snapshot_status = event.status,
                 snapshot_meet_url = event.meet_url,
                 snapshot_google_url = event.google_url,
                 updated_at = $3
             FROM google_calendar_events event
             WHERE link.workspace_id = $1 AND link.source_id = $2
               AND event.workspace_id = link.workspace_id
               AND event.source_id = link.source_id
               AND event.google_event_id = link.google_event_id",
        )
        .bind(input.workspace_id)
        .bind(input.source_id)
        .bind(input.now)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        let (channel_id, token_hash, resource_id, channel_expires_at) = input
            .watch_channel
            .map(|watch| {
                (
                    Some(watch.channel.channel_id),
                    Some(watch.token_hash),
                    Some(watch.channel.resource_id),
                    Some(watch.channel.expires_at),
                )
            })
            .unwrap_or((None, None, None, None));
        let result = sqlx::query(
            "UPDATE google_calendar_sync_states
             SET next_sync_token = $4, last_synced_at = $5, last_error = NULL,
                 next_attempt_at = $6, attempts = 0,
                 channel_id = COALESCE($7, channel_id),
                 webhook_token_hash = COALESCE($8, webhook_token_hash),
                 resource_id = COALESCE($9, resource_id),
                 channel_expires_at = COALESCE($10, channel_expires_at),
                 lease_token = NULL, leased_until = NULL
             WHERE workspace_id = $1 AND source_id = $2 AND lease_token = $3",
        )
        .bind(input.workspace_id)
        .bind(input.source_id)
        .bind(input.lease_token)
        .bind(input.next_sync_token)
        .bind(input.now)
        .bind(input.next_attempt_at)
        .bind(channel_id)
        .bind(token_hash)
        .bind(resource_id)
        .bind(channel_expires_at)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() != 1 {
            return Err(RepositoryError::Unexpected);
        }
        tx.commit().await.map_err(map_sqlx_error)?;
        Ok(())
    }

    async fn fail_sync(
        &self,
        workspace_id: Uuid,
        source_id: Uuid,
        lease_token: Uuid,
        error_code: &str,
        next_attempt_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError> {
        sqlx::query(
            "UPDATE google_calendar_sync_states
             SET attempts = attempts + 1, last_error = $4, next_attempt_at = $5,
                 lease_token = NULL, leased_until = NULL
             WHERE workspace_id = $1 AND source_id = $2 AND lease_token = $3",
        )
        .bind(workspace_id)
        .bind(source_id)
        .bind(lease_token)
        .bind(error_code.chars().take(100).collect::<String>())
        .bind(next_attempt_at)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(map_sqlx_error)
    }

    async fn enqueue_webhook(
        &self,
        channel_id: &str,
        resource_id: &str,
        token_hash: &str,
        message_number: i64,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError> {
        sqlx::query(
            "UPDATE google_calendar_sync_states
             SET next_attempt_at = LEAST(next_attempt_at, $5),
                 last_message_number = $4
             WHERE channel_id = $1 AND resource_id = $2 AND webhook_token_hash = $3
               AND $4 > last_message_number",
        )
        .bind(channel_id)
        .bind(resource_id)
        .bind(token_hash)
        .bind(message_number)
        .bind(now)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected() == 1)
        .map_err(map_sqlx_error)
    }

    async fn cleanup_unlinked_events(
        &self,
        before: DateTime<Utc>,
        limit: i64,
    ) -> Result<u64, RepositoryError> {
        sqlx::query(
            "WITH candidates AS (
                 SELECT event.workspace_id, event.source_id, event.google_event_id
                 FROM google_calendar_events event
                 LEFT JOIN google_calendar_event_links link
                   ON link.workspace_id = event.workspace_id
                  AND link.source_id = event.source_id
                  AND link.google_event_id = event.google_event_id
                 WHERE event.ends_at < $1 AND link.id IS NULL
                 ORDER BY event.ends_at LIMIT $2
             )
             DELETE FROM google_calendar_events event
             USING candidates candidate
             WHERE event.workspace_id = candidate.workspace_id
               AND event.source_id = candidate.source_id
               AND event.google_event_id = candidate.google_event_id",
        )
        .bind(before)
        .bind(limit.clamp(1, 10_000))
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(map_sqlx_error)
    }
}
