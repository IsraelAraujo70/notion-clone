use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::application::ports::page::OperationGroupMetadata;
use crate::domain::block::Operation;

const CHANNEL_CAPACITY: usize = 1024;

/// Op já persistida e pronta para fan-out aos subscribers do workspace.
#[derive(Debug, Clone, Serialize)]
pub struct AppliedOpEvent {
    pub workspace_id: Uuid,
    pub seq: i64,
    pub op_id: Uuid,
    pub actor_id: Uuid,
    pub operation: Operation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<OperationGroupMetadata>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PresencePeer {
    pub connection_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focused_block_id: Option<Uuid>,
    pub color: String,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RealtimeEvent {
    Op { event: AppliedOpEvent },
    PresenceSnapshot { peers: Vec<PresencePeer> },
    PresenceUpdate { peer: PresencePeer },
    PresenceLeave { connection_id: Uuid },
}

/// Broadcast in-process por workspace. v1 single-instance; multi-node troca o hub por Redis/NATS.
#[derive(Clone, Default)]
pub struct RealtimeHub {
    channels: Arc<Mutex<HashMap<Uuid, broadcast::Sender<RealtimeEvent>>>>,
    presence: Arc<Mutex<HashMap<Uuid, HashMap<Uuid, PresencePeer>>>>,
}

impl RealtimeHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, workspace_id: Uuid) -> broadcast::Receiver<RealtimeEvent> {
        let mut channels = self.channels.lock().expect("realtime hub lock");
        channels
            .entry(workspace_id)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    pub fn publish_op(&self, event: AppliedOpEvent) {
        self.publish(event.workspace_id, RealtimeEvent::Op { event });
    }

    pub fn join_presence(&self, workspace_id: Uuid, peer: PresencePeer) -> Vec<PresencePeer> {
        let connection_id = peer.connection_id;
        let mut presence = self.presence.lock().expect("presence lock");
        let room = presence.entry(workspace_id).or_default();
        room.insert(connection_id, peer.clone());
        let snapshot: Vec<_> = room.values().cloned().collect();
        drop(presence);

        self.publish(workspace_id, RealtimeEvent::PresenceUpdate { peer });
        snapshot
    }

    pub fn update_presence(
        &self,
        workspace_id: Uuid,
        connection_id: Uuid,
        page_id: Option<Uuid>,
        focused_block_id: Option<Uuid>,
        now: DateTime<Utc>,
    ) -> Option<PresencePeer> {
        let mut presence = self.presence.lock().expect("presence lock");
        let room = presence.get_mut(&workspace_id)?;
        let peer = room.get_mut(&connection_id)?;
        peer.page_id = page_id;
        peer.focused_block_id = focused_block_id;
        peer.last_seen = now;
        let updated = peer.clone();
        drop(presence);

        self.publish(
            workspace_id,
            RealtimeEvent::PresenceUpdate {
                peer: updated.clone(),
            },
        );
        Some(updated)
    }

    pub fn leave_presence(&self, workspace_id: Uuid, connection_id: Uuid) {
        let mut presence = self.presence.lock().expect("presence lock");
        if let Some(room) = presence.get_mut(&workspace_id) {
            room.remove(&connection_id);
            if room.is_empty() {
                presence.remove(&workspace_id);
            }
        }
        drop(presence);
        self.publish(workspace_id, RealtimeEvent::PresenceLeave { connection_id });
    }

    pub fn list_presence(&self, workspace_id: Uuid) -> Vec<PresencePeer> {
        self.presence
            .lock()
            .expect("presence lock")
            .get(&workspace_id)
            .map(|room| room.values().cloned().collect())
            .unwrap_or_default()
    }

    fn publish(&self, workspace_id: Uuid, event: RealtimeEvent) {
        let channels = self.channels.lock().expect("realtime hub lock");
        if let Some(sender) = channels.get(&workspace_id) {
            let _ = sender.send(event);
        }
    }
}

/// Cor estável a partir do user_id (borda do avatar).
pub fn presence_color(user_id: Uuid) -> String {
    const PALETTE: [&str; 8] = [
        "#e16259", "#d9730d", "#cb912f", "#448361", "#337ea9", "#9065b0", "#c14c8a", "#787774",
    ];
    let bytes = user_id.as_bytes();
    let idx = (bytes[0] as usize).wrapping_add(bytes[15] as usize) % PALETTE.len();
    PALETTE[idx].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::block::{BlockType, Operation};
    use serde_json::Map;

    #[test]
    fn publish_op_reaches_subscribers_of_the_same_workspace() {
        let hub = RealtimeHub::new();
        let workspace_id = Uuid::new_v4();
        let other = Uuid::new_v4();
        let mut a = hub.subscribe(workspace_id);
        let mut b = hub.subscribe(workspace_id);
        let mut outsider = hub.subscribe(other);

        let event = AppliedOpEvent {
            workspace_id,
            seq: 3,
            op_id: Uuid::new_v4(),
            actor_id: Uuid::new_v4(),
            operation: Operation::UpdateBlock {
                op_id: Uuid::new_v4(),
                block_id: Uuid::new_v4(),
                block_type: Some(BlockType::Paragraph),
                properties: Some(Map::new()),
                prop_versions: None,
            },
            group: None,
        };
        hub.publish_op(event);

        match a.try_recv().unwrap() {
            RealtimeEvent::Op { event } => assert_eq!(event.seq, 3),
            other => panic!("expected op, got {other:?}"),
        }
        match b.try_recv().unwrap() {
            RealtimeEvent::Op { event } => assert_eq!(event.seq, 3),
            other => panic!("expected op, got {other:?}"),
        }
        assert!(outsider.try_recv().is_err());
    }

    #[test]
    fn presence_join_update_leave() {
        let hub = RealtimeHub::new();
        let workspace_id = Uuid::new_v4();
        let connection_id = Uuid::new_v4();
        let mut rx = hub.subscribe(workspace_id);

        let peer = PresencePeer {
            connection_id,
            user_id: Uuid::new_v4(),
            display_name: "Israel".into(),
            avatar_url: None,
            page_id: None,
            focused_block_id: None,
            color: "#e16259".into(),
            last_seen: Utc::now(),
        };
        let snapshot = hub.join_presence(workspace_id, peer);
        assert_eq!(snapshot.len(), 1);
        assert!(matches!(
            rx.try_recv().unwrap(),
            RealtimeEvent::PresenceUpdate { .. }
        ));

        let page_id = Uuid::new_v4();
        let block_id = Uuid::new_v4();
        hub.update_presence(
            workspace_id,
            connection_id,
            Some(page_id),
            Some(block_id),
            Utc::now(),
        );
        match rx.try_recv().unwrap() {
            RealtimeEvent::PresenceUpdate { peer } => {
                assert_eq!(peer.page_id, Some(page_id));
                assert_eq!(peer.focused_block_id, Some(block_id));
            }
            other => panic!("expected update, got {other:?}"),
        }

        hub.leave_presence(workspace_id, connection_id);
        assert!(matches!(
            rx.try_recv().unwrap(),
            RealtimeEvent::PresenceLeave { .. }
        ));
        assert!(hub.list_presence(workspace_id).is_empty());
    }
}
