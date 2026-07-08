use async_trait::async_trait;
use reqwest::Client;
use serde::Serialize;

use crate::application::ports::EmailError;
use crate::application::ports::email::{EmailSender, PasswordResetEmail, WorkspaceInviteEmail};

const RESEND_EMAILS_URL: &str = "https://api.resend.com/emails";

#[derive(Debug, Clone)]
pub struct ResendEmailSender {
    client: Client,
    api_key: String,
    from: String,
}

impl ResendEmailSender {
    pub fn new(api_key: String, from: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            from,
        }
    }
}

#[derive(Serialize)]
struct SendEmailRequest<'a> {
    from: &'a str,
    to: [&'a str; 1],
    subject: &'a str,
    html: String,
    text: String,
}

#[async_trait]
impl EmailSender for ResendEmailSender {
    async fn send_password_reset(&self, email: PasswordResetEmail) -> Result<(), EmailError> {
        let subject = "Reset your MicroSaaS Starter password";
        let text = format!(
            "Hi {},\n\nUse this link to reset your MicroSaaS Starter password:\n{}\n\nThis link expires at {}.\n\nIf you did not ask for this, you can ignore this email.",
            email.display_name, email.reset_url, email.expires_at
        );
        let html = format!(
            "<p>Hi {},</p><p>Use this link to reset your MicroSaaS Starter password:</p><p><a href=\"{}\">Reset password</a></p><p>This link expires at {}.</p><p>If you did not ask for this, you can ignore this email.</p>",
            escape_html(&email.display_name),
            escape_html(&email.reset_url),
            email.expires_at
        );
        self.send(email.to, subject.to_string(), html, text, "password reset")
            .await
    }

    async fn send_workspace_invite(&self, email: WorkspaceInviteEmail) -> Result<(), EmailError> {
        let subject = format!("You were invited to {} on reason", email.workspace_name);
        let text = format!(
            "Hi,\n\n{} invited you to join {} as {}.\n\nAccept the invite here:\n{}\n\nThis invite expires at {}.",
            email.inviter_display_name,
            email.workspace_name,
            email.role,
            email.invite_url,
            email.expires_at
        );
        let html = format!(
            "<p>Hi,</p><p>{} invited you to join <strong>{}</strong> as <strong>{}</strong>.</p><p><a href=\"{}\">Accept invite</a></p><p>This invite expires at {}.</p>",
            escape_html(&email.inviter_display_name),
            escape_html(&email.workspace_name),
            escape_html(&email.role),
            escape_html(&email.invite_url),
            email.expires_at
        );

        self.send(email.to, subject, html, text, "workspace invite")
            .await
    }
}

impl ResendEmailSender {
    async fn send(
        &self,
        to: String,
        subject: String,
        html: String,
        text: String,
        kind: &'static str,
    ) -> Result<(), EmailError> {
        let request = SendEmailRequest {
            from: &self.from,
            to: [&to],
            subject: &subject,
            html,
            text,
        };

        let response = self
            .client
            .post(RESEND_EMAILS_URL)
            .bearer_auth(&self.api_key)
            .header("User-Agent", "reason-api/0.1")
            .json(&request)
            .send()
            .await
            .map_err(|_| EmailError::Unexpected)?;

        if response.status().is_success() {
            return Ok(());
        }

        tracing::error!(status = %response.status(), kind, "Resend email request failed");
        Err(EmailError::Unexpected)
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
