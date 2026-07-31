use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Redirect;
use axum::{Json, response::IntoResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::adapters::http::auth_extractor::AuthenticatedUser;
use crate::adapters::http::error::HttpError;
use crate::application::AppError;
use crate::application::google_calendar::{
    LinkCalendarNotesInput, ListCalendarEventsInput, ReplaceCalendarSourcesInput,
    StartGoogleOAuthInput,
};
use crate::bootstrap::state::AppState;

pub async fn start_oauth(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Json(input): Json<StartGoogleOAuthInputDto>,
) -> Result<impl IntoResponse, HttpError> {
    state
        .google_calendar_oauth
        .start(
            auth.user.id,
            StartGoogleOAuthInput {
                workspace_id: input.workspace_id,
                database_id: input.database_id,
            },
        )
        .await
        .map(Json)
        .map_err(Into::into)
}

#[derive(Deserialize)]
pub struct StartGoogleOAuthInputDto {
    workspace_id: Uuid,
    database_id: Uuid,
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

pub async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect, HttpError> {
    if query.error.is_some() {
        return Err(HttpError(AppError::GoogleCalendarOAuthInvalid));
    }
    let state_value = query
        .state
        .as_deref()
        .ok_or(HttpError(AppError::GoogleCalendarOAuthInvalid))?;
    let code = query
        .code
        .as_deref()
        .ok_or(HttpError(AppError::GoogleCalendarOAuthInvalid))?;
    let redirect = state
        .google_calendar_oauth
        .complete(state_value, code)
        .await?;
    tracing::info!(
        event = "google_calendar_oauth_completed",
        google_calendar_oauth_completed_total = 1_u64
    );
    Ok(Redirect::to(&redirect))
}

pub async fn list_connections(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
) -> Result<impl IntoResponse, HttpError> {
    state
        .google_calendar_oauth
        .list_connections(auth.user.id)
        .await
        .map(Json)
        .map_err(Into::into)
}

pub async fn disconnect(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path(connection_id): Path<Uuid>,
) -> Result<StatusCode, HttpError> {
    state
        .google_calendar_oauth
        .disconnect(auth.user.id, connection_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_sources(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, database_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, HttpError> {
    state
        .google_calendar
        .sources(auth.user.id, workspace_id, database_id)
        .await
        .map(Json)
        .map_err(Into::into)
}

pub async fn replace_sources(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, database_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<ReplaceCalendarSourcesInput>,
) -> Result<impl IntoResponse, HttpError> {
    state
        .google_calendar
        .replace_sources(auth.user.id, workspace_id, database_id, input)
        .await
        .map(Json)
        .map_err(Into::into)
}

#[derive(Deserialize)]
pub struct CalendarEventsQuery {
    start: String,
    end: String,
    timezone: String,
}

pub async fn list_events(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, database_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<CalendarEventsQuery>,
) -> Result<impl IntoResponse, HttpError> {
    state
        .google_calendar
        .events(
            auth.user.id,
            workspace_id,
            database_id,
            ListCalendarEventsInput {
                start: query.start,
                end: query.end,
                time_zone: query.timezone,
            },
        )
        .await
        .map(Json)
        .map_err(Into::into)
}

pub async fn link_notes(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, database_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<LinkCalendarNotesInput>,
) -> Result<impl IntoResponse, HttpError> {
    let link = state
        .google_calendar
        .link_notes(auth.user.id, workspace_id, database_id, input)
        .await?;
    tracing::info!(
        event = "google_calendar_notes_materialized",
        google_calendar_notes_materialized_total = 1_u64,
        workspace_id = %workspace_id,
        database_id = %database_id,
    );
    Ok(Json(link))
}

pub async fn unlink_notes(
    State(state): State<AppState>,
    auth: AuthenticatedUser,
    Path((workspace_id, database_id, row_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<StatusCode, HttpError> {
    state
        .google_calendar
        .unlink_notes(auth.user.id, workspace_id, database_id, row_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, HttpError> {
    let header = |name: &'static str| headers.get(name).and_then(|value| value.to_str().ok());
    let (Some(channel_id), Some(resource_id), Some(token), Some(message_number)) = (
        header("x-goog-channel-id"),
        header("x-goog-resource-id"),
        header("x-goog-channel-token"),
        header("x-goog-message-number").and_then(|value| value.parse::<i64>().ok()),
    ) else {
        return Ok(StatusCode::NO_CONTENT);
    };
    let _ = state
        .google_calendar
        .webhook(channel_id, resource_id, token, message_number)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
