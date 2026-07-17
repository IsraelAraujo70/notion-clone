use crate::{
    adapters::http::{auth_extractor::AuthenticatedUser, error::HttpError},
    application::{
        ai::{AiActionInput, AiEvent, use_case::validate_prompt},
        ports::ai::{AiConversation, AiRun, StoredAiMessage},
    },
    bootstrap::state::AppState,
};
use axum::{
    Json,
    extract::{Path, State},
    response::sse::{Event, KeepAlive, Sse},
};
use futures_util::stream;
use serde::Deserialize;
use std::{convert::Infallible, time::Duration};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateConversationRequest {
    #[serde(default)]
    pub title: String,
}

pub async fn list_conversations(
    State(s): State<AppState>,
    auth: AuthenticatedUser,
    Path(w): Path<Uuid>,
) -> Result<Json<Vec<AiConversation>>, HttpError> {
    Ok(Json(s.ai.list_conversations(auth.user.id, w).await?))
}
pub async fn create_conversation(
    State(s): State<AppState>,
    auth: AuthenticatedUser,
    Path(w): Path<Uuid>,
    Json(r): Json<CreateConversationRequest>,
) -> Result<Json<AiConversation>, HttpError> {
    Ok(Json(
        s.ai.create_conversation(auth.user.id, w, r.title).await?,
    ))
}
pub async fn messages(
    State(s): State<AppState>,
    auth: AuthenticatedUser,
    Path((w, c)): Path<(Uuid, Uuid)>,
) -> Result<Json<Vec<StoredAiMessage>>, HttpError> {
    Ok(Json(s.ai.messages(auth.user.id, w, c).await?))
}
pub async fn run_status(
    State(s): State<AppState>,
    auth: AuthenticatedUser,
    Path((w, r)): Path<(Uuid, Uuid)>,
) -> Result<Json<AiRun>, HttpError> {
    Ok(Json(s.ai.run_status(auth.user.id, w, r).await?))
}
pub async fn action(
    State(s): State<AppState>,
    auth: AuthenticatedUser,
    Path((w, action)): Path<(Uuid, String)>,
    Json(input): Json<AiActionInput>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, HttpError> {
    match action.as_str() {
        "continue_writing"
        | "summarize_page"
        | "transform_selection"
        | "transform_page"
        | "workspace_agent" => {}
        _ => {
            return Err(HttpError(crate::application::AppError::from(
                crate::domain::error::DomainError::Validation("Unknown AI action"),
            )));
        }
    }
    validate_prompt(&input.prompt)?;
    let events = s.ai.run_action(auth.user.id, w, &action, input).await?;
    let events = stream::unfold(events, |mut events| async move {
        events.recv().await.map(|event| {
            let item = Ok(Event::default()
                .event(event_name(&event))
                .json_data(event)
                .expect("serializable AI event"));
            (item, events)
        })
    });
    Ok(Sse::new(events).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(10))
            .text("heartbeat"),
    ))
}
fn event_name(event: &AiEvent) -> &'static str {
    match event {
        AiEvent::Run { .. } => "run",
        AiEvent::Text { .. } => "text",
        AiEvent::Tool { .. } => "tool",
        AiEvent::Usage { .. } => "usage",
        AiEvent::Completion { .. } => "completion",
        AiEvent::RunFailed { .. } => "run_failed",
    }
}
