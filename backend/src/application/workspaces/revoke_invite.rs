use std::sync::Arc;

use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_owner;

#[derive(Clone)]
pub struct RevokeInviteUseCase {
    workspace_repository: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl RevokeInviteUseCase {
    pub fn new(workspace_repository: Arc<dyn WorkspaceRepository>, clock: Arc<dyn Clock>) -> Self {
        Self {
            workspace_repository,
            clock,
        }
    }

    pub async fn execute(
        &self,
        actor_id: Uuid,
        workspace_id: Uuid,
        invite_id: Uuid,
    ) -> Result<(), AppError> {
        require_owner(&self.workspace_repository, workspace_id, actor_id).await?;
        self.workspace_repository
            .revoke_invite(workspace_id, invite_id, self.clock.now())
            .await
            .map_err(Into::into)
    }
}
