use std::sync::Arc;

use uuid::Uuid;

use crate::application::realtime::{AppliedOpEvent, RealtimeHub};
use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::page::{OperationAck, PageRepository};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_writer;
use crate::domain::block::Operation;

#[derive(Clone)]
pub struct ApplyOperationUseCase {
    page_repository: Arc<dyn PageRepository>,
    workspace_repository: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
    hub: RealtimeHub,
}

impl ApplyOperationUseCase {
    pub fn new(
        page_repository: Arc<dyn PageRepository>,
        workspace_repository: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
        hub: RealtimeHub,
    ) -> Self {
        Self {
            page_repository,
            workspace_repository,
            clock,
            hub,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        operation: Operation,
    ) -> Result<OperationAck, AppError> {
        require_writer(&self.workspace_repository, workspace_id, user_id).await?;
        let op_id = operation.op_id();
        let ack = self
            .page_repository
            .apply_operation(workspace_id, user_id, &operation, self.clock.now())
            .await
            .map_err(AppError::from)?;

        // Replay idempotente devolve o seq original; ainda assim o evento é
        // inofensivo se o cliente filtrar por op_id — e cobre o caso de um
        // peer que perdeu o broadcast da primeira entrega.
        self.hub.publish(AppliedOpEvent {
            workspace_id,
            seq: ack.seq,
            op_id,
            actor_id: user_id,
            operation,
        });

        Ok(ack)
    }
}
