use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::Duration;
use rand::RngCore;
use rand::rngs::OsRng;
use serde::Serialize;
use sha2::{Digest, Sha256};
use url::Url;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::google_calendar::{
    CreateGoogleOAuthState, GoogleCalendarGateway, GoogleCalendarGatewayError,
    GoogleCalendarRepository, PlainSecret, SaveGoogleConnection, SecretCipher,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::require_member;
use crate::domain::google_calendar::{GOOGLE_CALENDAR_SCOPES, GoogleCalendarConnection};

const OAUTH_STATE_TTL_MINUTES: i64 = 10;
const GOOGLE_USERINFO_EMAIL_SCOPE: &str = "https://www.googleapis.com/auth/userinfo.email";

#[derive(Debug, Clone)]
pub struct StartGoogleOAuthInput {
    pub workspace_id: Uuid,
    pub database_id: Uuid,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StartGoogleOAuthOutput {
    pub authorization_url: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone)]
pub struct GoogleCalendarOAuthUseCases {
    repository: Arc<dyn GoogleCalendarRepository>,
    gateway: Option<Arc<dyn GoogleCalendarGateway>>,
    cipher: Option<Arc<dyn SecretCipher>>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
    redirect_uri: String,
    public_web_url: String,
}

impl GoogleCalendarOAuthUseCases {
    pub fn new(
        repository: Arc<dyn GoogleCalendarRepository>,
        gateway: Option<Arc<dyn GoogleCalendarGateway>>,
        cipher: Option<Arc<dyn SecretCipher>>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
        redirect_uri: String,
        public_web_url: String,
    ) -> Self {
        Self {
            repository,
            gateway,
            cipher,
            workspaces,
            clock,
            redirect_uri,
            public_web_url,
        }
    }

    pub fn configured(&self) -> bool {
        self.gateway.is_some() && self.cipher.is_some()
    }

    pub async fn start(
        &self,
        user_id: Uuid,
        input: StartGoogleOAuthInput,
    ) -> Result<StartGoogleOAuthOutput, AppError> {
        require_member(&self.workspaces, input.workspace_id, user_id).await?;
        let return_page_id = self
            .repository
            .find_database_page(input.workspace_id, input.database_id)
            .await?
            .ok_or(AppError::Domain(
                crate::domain::error::DomainError::Validation(
                    "Calendar target must be a live database in this workspace",
                ),
            ))?;
        let gateway = self
            .gateway
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let cipher = self
            .cipher
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let state = random_url_token(32);
        let verifier = PlainSecret::new(random_url_token(64));
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.expose().as_bytes()));
        let now = self.clock.now();
        let expires_at = now + Duration::minutes(OAUTH_STATE_TTL_MINUTES);
        self.repository
            .create_oauth_state(CreateGoogleOAuthState {
                id: Uuid::new_v4(),
                workspace_id: input.workspace_id,
                user_id,
                state_hash: sha256_hex(&state),
                verifier: cipher
                    .encrypt(user_id, &verifier)
                    .map_err(|_| AppError::Internal)?,
                return_database_id: input.database_id,
                return_page_id,
                expires_at,
                created_at: now,
            })
            .await?;
        Ok(StartGoogleOAuthOutput {
            authorization_url: gateway.authorization_url(&state, &challenge, &self.redirect_uri),
            expires_at,
        })
    }

    pub async fn complete(&self, state: &str, code: &str) -> Result<String, AppError> {
        if state.len() > 2048 || code.is_empty() || code.len() > 4096 {
            return Err(AppError::GoogleCalendarOAuthInvalid);
        }
        let pending = self
            .repository
            .consume_oauth_state(&sha256_hex(state), self.clock.now())
            .await?
            .ok_or(AppError::GoogleCalendarOAuthInvalid)?;
        let gateway = self
            .gateway
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let cipher = self
            .cipher
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let verifier = cipher
            .decrypt(pending.user_id, &pending.verifier)
            .map_err(|_| AppError::GoogleCalendarOAuthInvalid)?;
        let credentials = gateway
            .exchange_code(code, &verifier, &self.redirect_uri)
            .await
            .map_err(map_gateway_error)?;
        let missing_scopes = missing_required_scopes(&credentials.granted_scopes);
        if !missing_scopes.is_empty() {
            tracing::warn!(
                event = "google_calendar_oauth_scope_validation_failed",
                ?missing_scopes,
            );
            if gateway.revoke(&credentials.refresh_token).await.is_err() {
                tracing::warn!(event = "google_calendar_oauth_invalid_grant_cleanup_failed");
            }
            return Err(AppError::GoogleCalendarOAuthInvalid);
        }
        let encrypted = cipher
            .encrypt(pending.user_id, &credentials.refresh_token)
            .map_err(|_| AppError::Internal)?;
        self.repository
            .save_connection(SaveGoogleConnection {
                id: Uuid::new_v4(),
                user_id: pending.user_id,
                google_account_id: credentials.google_account_id,
                account_email: credentials.account_email,
                refresh_token: encrypted,
                granted_scopes: credentials.granted_scopes,
                connected_at: self.clock.now(),
            })
            .await?;
        let mut redirect = Url::parse(&self.public_web_url).map_err(|_| AppError::Internal)?;
        redirect.set_path(&format!("/dashboard/pages/{}", pending.return_page_id));
        redirect
            .query_pairs_mut()
            .append_pair("google_calendar", "connected")
            .append_pair("database", &pending.return_database_id.to_string());
        Ok(redirect.into())
    }

    pub async fn list_connections(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<GoogleCalendarConnection>, AppError> {
        self.repository
            .list_connections(user_id)
            .await
            .map_err(Into::into)
    }

    pub async fn disconnect(&self, user_id: Uuid, connection_id: Uuid) -> Result<(), AppError> {
        let secret = self
            .repository
            .find_connection_secret(user_id, connection_id)
            .await?
            .ok_or(AppError::GoogleCalendarConnectionNotFound)?;
        if let (Some(gateway), Some(cipher)) = (&self.gateway, &self.cipher) {
            if let Ok(refresh_token) = cipher.decrypt(user_id, &secret.refresh_token) {
                let _ = gateway.revoke(&refresh_token).await;
            }
        }
        if self
            .repository
            .disconnect_connection(user_id, connection_id, self.clock.now())
            .await?
        {
            Ok(())
        } else {
            Err(AppError::GoogleCalendarConnectionNotFound)
        }
    }
}

fn random_url_token(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

fn missing_required_scopes(granted_scopes: &[String]) -> Vec<&'static str> {
    GOOGLE_CALENDAR_SCOPES
        .iter()
        .copied()
        .filter(|required| {
            !granted_scopes.iter().any(|granted| {
                granted == required
                    || (*required == "email" && granted == GOOGLE_USERINFO_EMAIL_SCOPE)
            })
        })
        .collect()
}

pub(crate) fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

pub(crate) fn map_gateway_error(error: GoogleCalendarGatewayError) -> AppError {
    match error {
        GoogleCalendarGatewayError::Unauthorized => AppError::GoogleCalendarOAuthInvalid,
        GoogleCalendarGatewayError::Gone
        | GoogleCalendarGatewayError::RateLimited
        | GoogleCalendarGatewayError::Unexpected => AppError::GoogleCalendarUnavailable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_and_pkce_tokens_have_enough_entropy_and_stable_hashes() {
        let first = random_url_token(32);
        let second = random_url_token(32);
        assert_ne!(first, second);
        assert!(first.len() >= 43);
        assert_eq!(sha256_hex("state").len(), 64);
        assert_eq!(sha256_hex("state"), sha256_hex("state"));
    }

    #[test]
    fn accepts_google_normalized_email_scope() {
        let granted_scopes = vec![
            "openid".to_string(),
            GOOGLE_USERINFO_EMAIL_SCOPE.to_string(),
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly".to_string(),
            "https://www.googleapis.com/auth/calendar.events.readonly".to_string(),
        ];

        assert!(missing_required_scopes(&granted_scopes).is_empty());
    }

    #[test]
    fn reports_a_missing_calendar_scope() {
        let granted_scopes = vec![
            "openid".to_string(),
            "email".to_string(),
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly".to_string(),
        ];

        assert_eq!(
            missing_required_scopes(&granted_scopes),
            vec!["https://www.googleapis.com/auth/calendar.events.readonly"]
        );
    }
}
