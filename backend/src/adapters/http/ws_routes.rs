use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, Query, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::time::{interval, MissedTickBehavior};
use uuid::Uuid;

use crate::adapters::http::error::HttpError;
use crate::application::auth::attach_avatar_url;
use crate::application::realtime::{
    presence_color, PresencePeer, RealtimeEvent,
};
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
    Op {
        event: crate::application::realtime::AppliedOpEvent,
    },
    Ping,
    PresenceSnapshot { peers: Vec<PresencePeer> },
    PresenceUpdate { peer: PresencePeer },
    PresenceLeave { connection_id: Uuid },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Presence {
        page_id: Option<Uuid>,
        focused_block_id: Option<Uuid>,
    },
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

    let user = attach_avatar_url(current.user, &state.storage);
    Ok(ws.on_upgrade(move |socket| {
        handle_socket(socket, state, workspace_id, latest_seq, user)
    }))
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    workspace_id: Uuid,
    latest_seq: i64,
    user: crate::domain::auth::User,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = state.hub.subscribe(workspace_id);
    let connection_id = Uuid::new_v4();

    let peer = PresencePeer {
        connection_id,
        user_id: user.id,
        display_name: user.display_name.clone(),
        avatar_url: user.avatar_url.clone(),
        page_id: None,
        focused_block_id: None,
        color: presence_color(user.id),
        last_seen: Utc::now(),
    };
    let peers = state.hub.join_presence(workspace_id, peer);

    if send_json(&mut sender, &ServerMessage::Hello { latest_seq })
        .await
        .is_err()
    {
        state.hub.leave_presence(workspace_id, connection_id);
        return;
    }
    if send_json(
        &mut sender,
        &ServerMessage::PresenceSnapshot { peers },
    )
    .await
    .is_err()
    {
        state.hub.leave_presence(workspace_id, connection_id);
        return;
    }

    let mut heartbeat = interval(Duration::from_secs(HEARTBEAT_SECS));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    heartbeat.tick().await;

    loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Ok(RealtimeEvent::Op { event }) => {
                        if send_json(&mut sender, &ServerMessage::Op { event }).await.is_err() {
                            break;
                        }
                    }
                    Ok(RealtimeEvent::PresenceSnapshot { peers }) => {
                        if send_json(&mut sender, &ServerMessage::PresenceSnapshot { peers }).await.is_err() {
                            break;
                        }
                    }
                    Ok(RealtimeEvent::PresenceUpdate { peer }) => {
                        // Não ecoa o próprio update de volta (join já mandou snapshot).
                        if peer.connection_id == connection_id {
                            continue;
                        }
                        if send_json(&mut sender, &ServerMessage::PresenceUpdate { peer }).await.is_err() {
                            break;
                        }
                    }
                    Ok(RealtimeEvent::PresenceLeave { connection_id: left }) => {
                        if left == connection_id {
                            continue;
                        }
                        if send_json(&mut sender, &ServerMessage::PresenceLeave { connection_id: left }).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            client = receiver.next() => {
                match client {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ClientMessage::Presence { page_id, focused_block_id }) =
                            serde_json::from_str::<ClientMessage>(&text)
                        {
                            state.hub.update_presence(
                                workspace_id,
                                connection_id,
                                page_id,
                                focused_block_id,
                                Utc::now(),
                            );
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {}
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

    state.hub.leave_presence(workspace_id, connection_id);
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
