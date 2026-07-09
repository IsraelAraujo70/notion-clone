use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Serialize;

use crate::application::ports::EmailError;
use crate::application::ports::email::{EmailSender, PasswordResetEmail, WorkspaceInviteEmail};

const RESEND_EMAILS_URL: &str = "https://api.resend.com/emails";
const PRODUCT_NAME: &str = "reason";

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
        let subject = format!("Redefinir senha do {PRODUCT_NAME}");
        let expires = format_expires(email.expires_at);
        let name = email.display_name.trim();
        let greeting = if name.is_empty() {
            "Olá,".to_string()
        } else {
            format!("Olá, {},", name)
        };

        let text = format!(
            "{greeting}\n\n\
Recebemos um pedido para redefinir a senha da sua conta no {PRODUCT_NAME}.\n\n\
Abra este link para escolher uma nova senha:\n{}\n\n\
O link expira em {expires}.\n\n\
Se você não pediu isso, pode ignorar este e-mail com segurança.\n\n\
— Equipe {PRODUCT_NAME}",
            email.reset_url
        );

        let html = branded_email(
            "Redefinir senha",
            &format!(
                "<p style=\"margin:0 0 16px;font-size:16px;line-height:1.55;color:#3f3f46;\">{}</p>\
                 <p style=\"margin:0 0 16px;font-size:16px;line-height:1.55;color:#3f3f46;\">\
Recebemos um pedido para redefinir a senha da sua conta no <strong style=\"color:#18181b;\">{PRODUCT_NAME}</strong>.\
                 </p>\
                 <p style=\"margin:0 0 24px;font-size:16px;line-height:1.55;color:#3f3f46;\">\
Clique no botão abaixo para escolher uma nova senha.\
                 </p>",
                escape_html(&greeting)
            ),
            Cta {
                label: "Redefinir senha",
                url: &email.reset_url,
            },
            &format!(
                "Este link expira em <strong style=\"color:#18181b;\">{}</strong>. \
Se você não pediu isso, ignore este e-mail.",
                escape_html(&expires)
            ),
        );

        self.send(email.to, subject, html, text, "password reset")
            .await
    }

    async fn send_workspace_invite(&self, email: WorkspaceInviteEmail) -> Result<(), EmailError> {
        let workspace = email.workspace_name.trim();
        let workspace_label = if workspace.is_empty() {
            "um workspace"
        } else {
            workspace
        };
        let role_label = role_pt(&email.role);
        let subject = format!("Convite para {} no {PRODUCT_NAME}", workspace_label);
        let expires = format_expires(email.expires_at);
        let inviter = email.inviter_display_name.trim();
        let inviter_label = if inviter.is_empty() {
            "Alguém".to_string()
        } else {
            inviter.to_string()
        };

        let text = format!(
            "Olá,\n\n\
{inviter_label} convidou você para o workspace \"{workspace_label}\" no {PRODUCT_NAME} \
como {role_label}.\n\n\
Aceite o convite aqui:\n{}\n\n\
O convite expira em {expires}.\n\n\
— Equipe {PRODUCT_NAME}",
            email.invite_url
        );

        let html = branded_email(
            "Convite para workspace",
            &format!(
                "<p style=\"margin:0 0 16px;font-size:16px;line-height:1.55;color:#3f3f46;\">Olá,</p>\
                 <p style=\"margin:0 0 16px;font-size:16px;line-height:1.55;color:#3f3f46;\">\
<strong style=\"color:#18181b;\">{}</strong> convidou você para o workspace \
<strong style=\"color:#18181b;\">{}</strong> no {PRODUCT_NAME}.\
                 </p>\
                 <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 24px;\">\
                   <tr>\
                     <td style=\"padding:10px 14px;border-radius:10px;background:#f4f4f5;font-size:14px;color:#52525b;\">\
Função: <strong style=\"color:#18181b;\">{}</strong>\
                     </td>\
                   </tr>\
                 </table>\
                 <p style=\"margin:0 0 24px;font-size:16px;line-height:1.55;color:#3f3f46;\">\
Aceite o convite para começar a colaborar.\
                 </p>",
                escape_html(&inviter_label),
                escape_html(workspace_label),
                escape_html(role_label),
            ),
            Cta {
                label: "Aceitar convite",
                url: &email.invite_url,
            },
            &format!(
                "Este convite expira em <strong style=\"color:#18181b;\">{}</strong>.",
                escape_html(&expires)
            ),
        );

        self.send(email.to, subject, html, text, "workspace invite")
            .await
    }
}

struct Cta<'a> {
    label: &'a str,
    url: &'a str,
}

fn branded_email(preheader: &str, body_html: &str, cta: Cta<'_>, footer_note: &str) -> String {
    let safe_url = escape_html(cta.url);
    let safe_label = escape_html(cta.label);
    let safe_preheader = escape_html(preheader);

    format!(
        r#"<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{PRODUCT_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    {safe_preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f4f4f5;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;border-radius:10px;background:#18181b;color:#fafafa;font-size:16px;font-weight:700;text-align:center;vertical-align:middle;line-height:36px;">
                    r
                  </td>
                  <td style="padding-left:12px;font-size:18px;font-weight:650;letter-spacing:-0.02em;color:#18181b;">
                    {PRODUCT_NAME}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              {body_html}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:10px;background:#18181b;">
                    <a href="{safe_url}"
                       style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#fafafa;text-decoration:none;border-radius:10px;">
                      {safe_label}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">
                Se o botão não funcionar, copie e cole este link no navegador:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="{safe_url}" style="color:#3b82f6;text-decoration:underline;">{safe_url}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                {footer_note}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f4f4f5;font-size:12px;line-height:1.5;color:#a1a1aa;">
              Enviado por {PRODUCT_NAME} · workspace colaborativo
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#
    )
}

fn role_pt(role: &str) -> &'static str {
    match role {
        "owner" => "proprietário",
        "editor" => "editor",
        "viewer" => "visualizador",
        _ => "membro",
    }
}

fn format_expires(when: DateTime<Utc>) -> String {
    // 16/07/2026 às 11:41 UTC
    when.format("%d/%m/%Y às %H:%M UTC").to_string()
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
            .header("User-Agent", "notion-clone-api/0.1")
            .json(&request)
            .send()
            .await
            .map_err(|error| {
                tracing::error!(%error, kind, "Resend HTTP client error");
                EmailError::Unexpected
            })?;

        let status = response.status();
        if status.is_success() {
            return Ok(());
        }

        let body = response.text().await.unwrap_or_default();
        tracing::error!(%status, kind, body = %body, "Resend email request failed");
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
