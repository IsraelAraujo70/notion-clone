use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use uuid::Uuid;

use crate::application::ports::RepositoryError;
use crate::domain::google_calendar::{
    CalendarDateRange, GoogleCalendarConnection, GoogleCalendarEventLink, GoogleCalendarSource,
    ResolvedGoogleCalendarSource,
};

pub struct PlainSecret(String);

impl PlainSecret {
    pub fn new(value: String) -> Self {
        Self(value)
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for PlainSecret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("[redacted]")
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct EncryptedSecret {
    pub key_id: String,
    pub ciphertext: String,
}

impl std::fmt::Debug for EncryptedSecret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("EncryptedSecret")
            .field("key_id", &self.key_id)
            .field("ciphertext", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretCipherError {
    InvalidKey,
    InvalidCiphertext,
    Unexpected,
}

pub trait SecretCipher: Send + Sync {
    fn encrypt(
        &self,
        owner_id: Uuid,
        secret: &PlainSecret,
    ) -> Result<EncryptedSecret, SecretCipherError>;

    fn decrypt(
        &self,
        owner_id: Uuid,
        secret: &EncryptedSecret,
    ) -> Result<PlainSecret, SecretCipherError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GoogleCalendarGatewayError {
    Unauthorized,
    Gone,
    RateLimited,
    Unexpected,
}

pub struct GoogleOAuthCredentials {
    pub google_account_id: String,
    pub account_email: String,
    pub refresh_token: PlainSecret,
    pub granted_scopes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleCalendarListEntry {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleCalendarEvent {
    pub id: String,
    pub ical_uid: Option<String>,
    pub recurring_event_id: Option<String>,
    pub original_start_at: Option<String>,
    pub title: String,
    pub range: Option<CalendarDateRange>,
    pub status: String,
    pub meet_url: Option<String>,
    pub location: Option<String>,
    pub google_url: Option<String>,
    pub etag: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleCalendarEventPage {
    pub events: Vec<GoogleCalendarEvent>,
    pub next_page_token: Option<String>,
    pub next_sync_token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleWatchChannel {
    pub channel_id: String,
    pub resource_id: String,
    pub expires_at: DateTime<Utc>,
}

#[async_trait]
pub trait GoogleCalendarGateway: Send + Sync {
    fn authorization_url(&self, state: &str, code_challenge: &str, redirect_uri: &str) -> String;

    async fn exchange_code(
        &self,
        code: &str,
        code_verifier: &PlainSecret,
        redirect_uri: &str,
    ) -> Result<GoogleOAuthCredentials, GoogleCalendarGatewayError>;

    async fn list_calendars(
        &self,
        refresh_token: &PlainSecret,
    ) -> Result<Vec<GoogleCalendarListEntry>, GoogleCalendarGatewayError>;

    async fn list_events(
        &self,
        refresh_token: &PlainSecret,
        calendar_id: &str,
        sync_token: Option<&str>,
        page_token: Option<&str>,
        sync_from: DateTime<Utc>,
    ) -> Result<GoogleCalendarEventPage, GoogleCalendarGatewayError>;

    async fn watch_events(
        &self,
        refresh_token: &PlainSecret,
        calendar_id: &str,
        channel_id: &str,
        channel_token: &str,
        webhook_url: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<GoogleWatchChannel, GoogleCalendarGatewayError>;

    async fn stop_channel(
        &self,
        refresh_token: &PlainSecret,
        channel_id: &str,
        resource_id: &str,
    ) -> Result<(), GoogleCalendarGatewayError>;

    async fn revoke(&self, refresh_token: &PlainSecret) -> Result<(), GoogleCalendarGatewayError>;
}

#[derive(Debug, Clone)]
pub struct CreateGoogleOAuthState {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub state_hash: String,
    pub verifier: EncryptedSecret,
    pub return_database_id: Uuid,
    pub return_page_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct PendingGoogleOAuthState {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub verifier: EncryptedSecret,
    pub return_database_id: Uuid,
    pub return_page_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct SaveGoogleConnection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub google_account_id: String,
    pub account_email: String,
    pub refresh_token: EncryptedSecret,
    pub granted_scopes: Vec<String>,
    pub connected_at: DateTime<Utc>,
}

pub struct GoogleConnectionSecret {
    pub id: Uuid,
    pub user_id: Uuid,
    pub refresh_token: EncryptedSecret,
}

impl std::fmt::Debug for GoogleConnectionSecret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("GoogleConnectionSecret")
            .field("id", &self.id)
            .field("user_id", &self.user_id)
            .field("refresh_token", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone)]
pub struct ReplaceGoogleCalendarSources {
    pub workspace_id: Uuid,
    pub database_block_id: Uuid,
    pub user_id: Uuid,
    pub sources: Vec<ResolvedGoogleCalendarSource>,
    pub sync_from: DateTime<Utc>,
    pub now: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProjectedExternalCalendarEvent {
    pub row_id: Option<Uuid>,
    pub source_id: Uuid,
    pub google_event_id: String,
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub time_zone: Option<String>,
    pub all_day: bool,
    pub status: String,
    pub meet_url: Option<String>,
    pub location: Option<String>,
    pub google_url: Option<String>,
    pub color: Option<String>,
    pub private: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ManualCalendarRow {
    pub row_id: Uuid,
    pub title: String,
    pub properties: Value,
    pub date_property_id: String,
}

#[derive(Debug, Clone)]
pub struct LinkGoogleCalendarEvent {
    pub id: Uuid,
    pub op_id: Uuid,
    pub workspace_id: Uuid,
    pub database_block_id: Uuid,
    pub database_row_id: Uuid,
    pub source_id: Uuid,
    pub google_event_id: String,
    pub linked_by: Uuid,
    pub now: DateTime<Utc>,
}

pub struct GoogleCalendarSyncJob {
    pub workspace_id: Uuid,
    pub source_id: Uuid,
    pub user_id: Uuid,
    pub connection_id: Uuid,
    pub calendar_id: String,
    pub sync_from: DateTime<Utc>,
    pub refresh_token: EncryptedSecret,
    pub next_sync_token: Option<String>,
    pub channel_id: Option<String>,
    pub resource_id: Option<String>,
    pub channel_expires_at: Option<DateTime<Utc>>,
    pub attempts: i32,
    pub lease_token: Uuid,
}

impl std::fmt::Debug for GoogleCalendarSyncJob {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("GoogleCalendarSyncJob")
            .field("workspace_id", &self.workspace_id)
            .field("source_id", &self.source_id)
            .field("user_id", &self.user_id)
            .field("calendar_id", &self.calendar_id)
            .field("refresh_token", &"[redacted]")
            .field("attempts", &self.attempts)
            .finish()
    }
}

#[derive(Debug, Clone)]
pub struct AppliedGoogleCalendarSync {
    pub workspace_id: Uuid,
    pub source_id: Uuid,
    pub lease_token: Uuid,
    pub events: Vec<GoogleCalendarEvent>,
    pub full_sync: bool,
    pub next_sync_token: String,
    pub watch_channel: Option<StoredGoogleWatchChannel>,
    pub now: DateTime<Utc>,
    pub next_attempt_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct StoredGoogleWatchChannel {
    pub channel: GoogleWatchChannel,
    pub token_hash: String,
}

#[async_trait]
pub trait GoogleCalendarRepository: Send + Sync {
    async fn find_database_page(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
    ) -> Result<Option<Uuid>, RepositoryError>;

    async fn create_oauth_state(
        &self,
        input: CreateGoogleOAuthState,
    ) -> Result<(), RepositoryError>;

    async fn consume_oauth_state(
        &self,
        state_hash: &str,
        now: DateTime<Utc>,
    ) -> Result<Option<PendingGoogleOAuthState>, RepositoryError>;

    async fn save_connection(
        &self,
        input: SaveGoogleConnection,
    ) -> Result<GoogleCalendarConnection, RepositoryError>;

    async fn list_connections(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<GoogleCalendarConnection>, RepositoryError>;

    async fn find_connection_secret(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
    ) -> Result<Option<GoogleConnectionSecret>, RepositoryError>;

    async fn disconnect_connection(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError>;

    async fn list_sources(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<GoogleCalendarSource>, RepositoryError>;

    async fn replace_sources(
        &self,
        input: ReplaceGoogleCalendarSources,
    ) -> Result<Vec<GoogleCalendarSource>, RepositoryError>;

    async fn list_external_events(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        user_id: Uuid,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        time_zone: &str,
    ) -> Result<Vec<ProjectedExternalCalendarEvent>, RepositoryError>;

    async fn list_manual_rows(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
    ) -> Result<Vec<ManualCalendarRow>, RepositoryError>;

    async fn link_event(
        &self,
        input: LinkGoogleCalendarEvent,
    ) -> Result<GoogleCalendarEventLink, RepositoryError>;

    async fn unlink_event(
        &self,
        workspace_id: Uuid,
        database_id: Uuid,
        row_id: Uuid,
    ) -> Result<bool, RepositoryError>;

    async fn claim_due_sync_jobs(
        &self,
        now: DateTime<Utc>,
        lease_until: DateTime<Utc>,
        limit: i64,
    ) -> Result<Vec<GoogleCalendarSyncJob>, RepositoryError>;

    async fn apply_sync(&self, input: AppliedGoogleCalendarSync) -> Result<(), RepositoryError>;

    async fn fail_sync(
        &self,
        workspace_id: Uuid,
        source_id: Uuid,
        lease_token: Uuid,
        error_code: &str,
        next_attempt_at: DateTime<Utc>,
    ) -> Result<(), RepositoryError>;

    async fn enqueue_webhook(
        &self,
        channel_id: &str,
        resource_id: &str,
        token_hash: &str,
        message_number: i64,
        now: DateTime<Utc>,
    ) -> Result<bool, RepositoryError>;

    async fn cleanup_unlinked_events(
        &self,
        before: DateTime<Utc>,
        limit: i64,
    ) -> Result<u64, RepositoryError>;
}
