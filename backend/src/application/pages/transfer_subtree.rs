use std::sync::Arc;

use serde::Serialize;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::page::{PageRepository, TransferSubtreeResult};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::realtime::{AppliedOpEvent, RealtimeHub};
use crate::application::workspaces::permissions::require_owner;

#[derive(Debug, Clone, Serialize)]
pub struct TransferSubtreeResponse {
    pub transfer_id: Uuid,
    pub source_seq: i64,
    pub destination_seq: i64,
}

#[derive(Clone)]
pub struct TransferSubtreeUseCase {
    pages: Arc<dyn PageRepository>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
    hub: RealtimeHub,
}

impl TransferSubtreeUseCase {
    pub fn new(
        pages: Arc<dyn PageRepository>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
        hub: RealtimeHub,
    ) -> Self {
        Self {
            pages,
            workspaces,
            clock,
            hub,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        source_workspace_id: Uuid,
        destination_workspace_id: Uuid,
        block_id: Uuid,
        transfer_id: Uuid,
    ) -> Result<TransferSubtreeResponse, AppError> {
        if source_workspace_id == destination_workspace_id {
            return Err(crate::domain::error::DomainError::Validation(
                "Source and destination workspaces must differ",
            )
            .into());
        }
        require_owner(&self.workspaces, source_workspace_id, user_id).await?;
        require_owner(&self.workspaces, destination_workspace_id, user_id).await?;

        let result = self
            .pages
            .transfer_subtree(
                source_workspace_id,
                destination_workspace_id,
                block_id,
                transfer_id,
                user_id,
                self.clock.now(),
            )
            .await?;
        self.publish(source_workspace_id, &result, true);
        self.publish(destination_workspace_id, &result, false);

        Ok(TransferSubtreeResponse {
            transfer_id,
            source_seq: result.source.envelope.seq,
            destination_seq: result.destination.envelope.seq,
        })
    }

    fn publish(&self, workspace_id: Uuid, result: &TransferSubtreeResult, source: bool) {
        let applied = if source {
            &result.source
        } else {
            &result.destination
        };
        if !applied.inserted {
            return;
        }
        let envelope = &applied.envelope;
        self.hub.publish_op(AppliedOpEvent {
            workspace_id,
            seq: envelope.seq,
            op_id: envelope.op_id,
            actor_id: envelope.actor_id,
            operation: envelope.operation.clone(),
            group: None,
        });
    }
}
