use async_trait::async_trait;

use crate::application::ports::EmailError;
use crate::application::ports::email::{EmailSender, PasswordResetEmail, WorkspaceInviteEmail};

#[derive(Debug, Default)]
pub struct NoopEmailSender;

#[async_trait]
impl EmailSender for NoopEmailSender {
    async fn send_password_reset(&self, email: PasswordResetEmail) -> Result<(), EmailError> {
        tracing::warn!(
            to = %email.to,
            reset_url = %email.reset_url,
            "RESEND_API_KEY is not configured; password reset email was not sent"
        );
        Ok(())
    }

    async fn send_workspace_invite(&self, email: WorkspaceInviteEmail) -> Result<(), EmailError> {
        tracing::warn!(
            to = %email.to,
            workspace_name = %email.workspace_name,
            invite_url = %email.invite_url,
            "RESEND_API_KEY is not configured; workspace invite email was not sent"
        );
        Ok(())
    }
}
