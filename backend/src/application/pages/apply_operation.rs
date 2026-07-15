use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::page::{
    AppliedOperation, OperationAck, OperationGroup, PageRepository,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::realtime::{AppliedOpEvent, RealtimeHub};
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
        let mut acks = self
            .execute_batch(user_id, workspace_id, vec![operation], None)
            .await?;
        Ok(acks.remove(0))
    }

    pub async fn execute_batch(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        operations: Vec<Operation>,
        group: Option<OperationGroup>,
    ) -> Result<Vec<OperationAck>, AppError> {
        if operations.is_empty() {
            return Ok(Vec::new());
        }
        if operations.iter().any(|operation| {
            matches!(
                operation,
                Operation::TransferSubtreeOut { .. } | Operation::TransferSubtreeIn { .. }
            )
        }) {
            return Err(crate::domain::error::DomainError::Validation(
                "Transfer operations must use the transfer endpoint",
            )
            .into());
        }
        require_writer(&self.workspace_repository, workspace_id, user_id).await?;
        let applied = self
            .page_repository
            .apply_operation_batch(
                workspace_id,
                user_id,
                &operations,
                group.as_ref(),
                self.clock.now(),
            )
            .await
            .map_err(AppError::from)?;

        publish_inserted(&self.hub, workspace_id, &applied);

        Ok(applied
            .into_iter()
            .map(|result| OperationAck {
                op_id: result.envelope.op_id,
                seq: result.envelope.seq,
            })
            .collect())
    }
}

fn publish_inserted(hub: &RealtimeHub, workspace_id: Uuid, applied: &[AppliedOperation]) {
    for result in applied.iter().filter(|result| result.inserted) {
        let envelope = &result.envelope;
        hub.publish_op(AppliedOpEvent {
            workspace_id,
            seq: envelope.seq,
            op_id: envelope.op_id,
            actor_id: envelope.actor_id,
            operation: envelope.operation.clone(),
            group: envelope.group.clone(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::page::LoggedOperation;
    use crate::application::realtime::RealtimeEvent;

    fn applied(inserted: bool, seq: i64) -> AppliedOperation {
        let operation = Operation::DeleteBlock {
            op_id: Uuid::new_v4(),
            block_id: Uuid::new_v4(),
        };
        AppliedOperation {
            envelope: LoggedOperation {
                seq,
                op_id: operation.op_id(),
                actor_id: Uuid::new_v4(),
                operation,
                group: None,
            },
            inserted,
        }
    }

    #[test]
    fn replay_is_not_broadcast_but_new_canonical_row_is() {
        let workspace = Uuid::new_v4();
        let hub = RealtimeHub::new();
        let mut receiver = hub.subscribe(workspace);
        publish_inserted(&hub, workspace, &[applied(false, 3)]);
        assert!(matches!(
            receiver.try_recv(),
            Err(tokio::sync::broadcast::error::TryRecvError::Empty)
        ));

        publish_inserted(&hub, workspace, &[applied(true, 4)]);
        assert!(matches!(receiver.try_recv(), Ok(RealtimeEvent::Op { event }) if event.seq == 4));
    }
}
