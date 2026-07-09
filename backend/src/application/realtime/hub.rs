use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio::sync::broadcast;
use uuid::Uuid;

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
}

/// Broadcast in-process por workspace. v1 single-instance; multi-node troca o hub por Redis/NATS.
#[derive(Clone, Default)]
pub struct RealtimeHub {
    channels: Arc<Mutex<HashMap<Uuid, broadcast::Sender<AppliedOpEvent>>>>,
}

impl RealtimeHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, workspace_id: Uuid) -> broadcast::Receiver<AppliedOpEvent> {
        let mut channels = self.channels.lock().expect("realtime hub lock");
        channels
            .entry(workspace_id)
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    pub fn publish(&self, event: AppliedOpEvent) {
        let channels = self.channels.lock().expect("realtime hub lock");
        if let Some(sender) = channels.get(&event.workspace_id) {
            let _ = sender.send(event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::block::{BlockType, Operation};
    use serde_json::Map;

    #[test]
    fn publish_reaches_subscribers_of_the_same_workspace() {
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
        };
        hub.publish(event.clone());

        assert_eq!(a.try_recv().unwrap().seq, 3);
        assert_eq!(b.try_recv().unwrap().seq, 3);
        assert!(outsider.try_recv().is_err());
    }
}
