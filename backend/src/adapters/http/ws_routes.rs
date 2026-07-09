use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, Query, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::time::{interval, MissedTickBehavior};
use uuid::Uuid;

use crate::adapters::http::error::HttpError;
use crate::application::realtime::AppliedOpEvent;
use crate::bootstrap::state::AppState;

const HEARTBEAT_SECS: u64 = 25;

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    pub token: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    Hello { latest_seq: i64 },
    Op { event: AppliedOpEvent },
    Ping,
}

pub async fn workspace_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<WsQuery>,
) -> Result<impl IntoResponse, HttpError> {
    let current = state.get_current_user.execute(&query.token).await?;
    // Membership check + cursor snapshot for o hello.
    let snapshot = state
        .list_operations
        .execute(current.user.id, workspace_id, i64::MAX, Some(1))
        .await?;
    let latest_seq = snapshot.latest_seq;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, workspace_id, latest_seq)))
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    workspace_id: Uuid,
    latest_seq: i64,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = state.hub.subscribe(workspace_id);

    if send_json(&mut sender, &ServerMessage::Hello { latest_seq })
        .await
        .is_err()
    {
        return;
    }

    let mut heartbeat = interval(Duration::from_secs(HEARTBEAT_SECS));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    heartbeat.tick().await;

    loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Ok(event) => {
                        if send_json(&mut sender, &ServerMessage::Op { event }).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            client = receiver.next() => {
                match client {
                    Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                }
            }
            _ = heartbeat.tick() => {
                if send_json(&mut sender, &ServerMessage::Ping).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn send_json<S>(sender: &mut S, message: &ServerMessage) -> Result<(), ()>
where
    S: SinkExt<Message> + Unpin,
{
    let text = serde_json::to_string(message).map_err(|_| ())?;
    sender
        .send(Message::Text(text.into()))
        .await
        .map_err(|_| ())
}
