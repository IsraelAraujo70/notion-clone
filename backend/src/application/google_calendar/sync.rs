use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::Duration;
use rand::rngs::OsRng;
use rand::{Rng, RngCore};
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::google_calendar::{
    AppliedGoogleCalendarSync, GoogleCalendarGateway, GoogleCalendarGatewayError,
    GoogleCalendarRepository, SecretCipher, StoredGoogleWatchChannel,
};

const SYNC_LEASE_MINUTES: i64 = 5;
const SYNC_INTERVAL_MINUTES: i64 = 5;
const CHANNEL_LIFETIME_DAYS: i64 = 6;
const CHANNEL_RENEW_BEFORE_HOURS: i64 = 24;
const MAX_EVENT_PAGES: usize = 1_000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct GoogleCalendarSyncResult {
    pub claimed: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub events: usize,
}

#[derive(Clone)]
pub struct GoogleCalendarSyncUseCase {
    repository: Arc<dyn GoogleCalendarRepository>,
    gateway: Option<Arc<dyn GoogleCalendarGateway>>,
    cipher: Option<Arc<dyn SecretCipher>>,
    clock: Arc<dyn Clock>,
    webhook_url: String,
}

impl GoogleCalendarSyncUseCase {
    pub fn new(
        repository: Arc<dyn GoogleCalendarRepository>,
        gateway: Option<Arc<dyn GoogleCalendarGateway>>,
        cipher: Option<Arc<dyn SecretCipher>>,
        clock: Arc<dyn Clock>,
        webhook_url: String,
    ) -> Self {
        Self {
            repository,
            gateway,
            cipher,
            clock,
            webhook_url,
        }
    }

    pub async fn run_once(&self, limit: i64) -> Result<GoogleCalendarSyncResult, AppError> {
        let Some(gateway) = self.gateway.as_ref() else {
            return Ok(GoogleCalendarSyncResult::default());
        };
        let Some(cipher) = self.cipher.as_ref() else {
            return Ok(GoogleCalendarSyncResult::default());
        };
        let now = self.clock.now();
        let jobs = self
            .repository
            .claim_due_sync_jobs(now, now + Duration::minutes(SYNC_LEASE_MINUTES), limit)
            .await?;
        let mut result = GoogleCalendarSyncResult {
            claimed: jobs.len(),
            ..Default::default()
        };
        for job in jobs {
            let refresh_token = match cipher.decrypt(job.user_id, &job.refresh_token) {
                Ok(secret) => secret,
                Err(_) => {
                    self.fail(&job, "decrypt_failed").await?;
                    result.failed += 1;
                    continue;
                }
            };
            let synced = self.sync_job(gateway, &refresh_token, &job).await;
            match synced {
                Ok(event_count) => {
                    result.succeeded += 1;
                    result.events += event_count;
                }
                Err(error) => {
                    let code = match error {
                        GoogleCalendarGatewayError::Unauthorized => "account_revoked",
                        GoogleCalendarGatewayError::Gone => "full_sync_failed",
                        GoogleCalendarGatewayError::RateLimited => "rate_limited",
                        GoogleCalendarGatewayError::Unexpected => "google_unavailable",
                    };
                    self.fail(&job, code).await?;
                    if error == GoogleCalendarGatewayError::Unauthorized {
                        self.repository
                            .disconnect_connection(job.user_id, job.connection_id, self.clock.now())
                            .await?;
                    }
                    result.failed += 1;
                }
            }
        }
        self.repository
            .cleanup_unlinked_events(self.clock.now() - Duration::days(365), 5_000)
            .await?;
        Ok(result)
    }

    async fn sync_job(
        &self,
        gateway: &Arc<dyn GoogleCalendarGateway>,
        refresh_token: &crate::application::ports::google_calendar::PlainSecret,
        job: &crate::application::ports::google_calendar::GoogleCalendarSyncJob,
    ) -> Result<usize, GoogleCalendarGatewayError> {
        let (events, next_sync_token, full_sync) = fetch_with_full_sync_fallback(
            gateway,
            refresh_token,
            &job.calendar_id,
            job.next_sync_token.as_deref(),
            job.sync_from,
        )
        .await?;
        let now = self.clock.now();
        let renew_channel = job.channel_id.is_none()
            || job.resource_id.is_none()
            || job
                .channel_expires_at
                .is_none_or(|expires| expires <= now + Duration::hours(CHANNEL_RENEW_BEFORE_HOURS));
        let watch_channel = if renew_channel {
            let channel_id = Uuid::new_v4().to_string();
            let channel_token = random_url_token(32);
            let channel = gateway
                .watch_events(
                    refresh_token,
                    &job.calendar_id,
                    &channel_id,
                    &channel_token,
                    &self.webhook_url,
                    now + Duration::days(CHANNEL_LIFETIME_DAYS),
                )
                .await?;
            if let (Some(old_channel), Some(old_resource)) = (&job.channel_id, &job.resource_id) {
                let _ = gateway
                    .stop_channel(refresh_token, old_channel, old_resource)
                    .await;
            }
            Some(StoredGoogleWatchChannel {
                channel,
                token_hash: super::oauth::sha256_hex(&channel_token),
            })
        } else {
            None
        };
        let event_count = events.len();
        self.repository
            .apply_sync(AppliedGoogleCalendarSync {
                workspace_id: job.workspace_id,
                source_id: job.source_id,
                lease_token: job.lease_token,
                events,
                full_sync,
                next_sync_token,
                watch_channel,
                now,
                next_attempt_at: now + Duration::minutes(SYNC_INTERVAL_MINUTES),
            })
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        Ok(event_count)
    }

    async fn fail(
        &self,
        job: &crate::application::ports::google_calendar::GoogleCalendarSyncJob,
        code: &str,
    ) -> Result<(), AppError> {
        let entropy = OsRng.gen_range(0..=1_000);
        self.repository
            .fail_sync(
                job.workspace_id,
                job.source_id,
                job.lease_token,
                code,
                self.clock.now() + retry_delay(job.attempts, entropy),
            )
            .await?;
        Ok(())
    }
}

async fn fetch_with_full_sync_fallback(
    gateway: &Arc<dyn GoogleCalendarGateway>,
    refresh_token: &crate::application::ports::google_calendar::PlainSecret,
    calendar_id: &str,
    sync_token: Option<&str>,
    sync_from: chrono::DateTime<chrono::Utc>,
) -> Result<
    (
        Vec<crate::application::ports::google_calendar::GoogleCalendarEvent>,
        String,
        bool,
    ),
    GoogleCalendarGatewayError,
> {
    match fetch_all_pages(gateway, refresh_token, calendar_id, sync_token, sync_from).await {
        Ok((events, next)) => Ok((events, next, sync_token.is_none())),
        Err(GoogleCalendarGatewayError::Gone) if sync_token.is_some() => {
            let (events, next) =
                fetch_all_pages(gateway, refresh_token, calendar_id, None, sync_from).await?;
            Ok((events, next, true))
        }
        Err(error) => Err(error),
    }
}

async fn fetch_all_pages(
    gateway: &Arc<dyn GoogleCalendarGateway>,
    refresh_token: &crate::application::ports::google_calendar::PlainSecret,
    calendar_id: &str,
    sync_token: Option<&str>,
    sync_from: chrono::DateTime<chrono::Utc>,
) -> Result<
    (
        Vec<crate::application::ports::google_calendar::GoogleCalendarEvent>,
        String,
    ),
    GoogleCalendarGatewayError,
> {
    let mut events = Vec::new();
    let mut page_token = None;
    for _ in 0..MAX_EVENT_PAGES {
        let page = gateway
            .list_events(
                refresh_token,
                calendar_id,
                sync_token,
                page_token.as_deref(),
                sync_from,
            )
            .await?;
        events.extend(page.events);
        page_token = page.next_page_token;
        if page_token.is_none() {
            return page
                .next_sync_token
                .filter(|value| !value.is_empty())
                .map(|token| (events, token))
                .ok_or(GoogleCalendarGatewayError::Unexpected);
        }
    }
    Err(GoogleCalendarGatewayError::Unexpected)
}

pub fn retry_delay(attempts: i32, jitter_millis: i64) -> Duration {
    let exponent = attempts.clamp(0, 10) as u32;
    let seconds = 5_i64
        .saturating_mul(2_i64.saturating_pow(exponent))
        .min(21_600);
    Duration::seconds(seconds) + Duration::milliseconds(jitter_millis.clamp(0, 1_000))
}

fn random_url_token(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use async_trait::async_trait;
    use chrono::{TimeZone, Utc};

    use crate::application::ports::google_calendar::{
        GoogleCalendarEventPage, GoogleCalendarListEntry, GoogleOAuthCredentials,
        GoogleWatchChannel, PlainSecret,
    };

    use super::*;

    #[test]
    fn retry_backoff_is_bounded_and_jitter_is_explicit() {
        assert_eq!(retry_delay(0, 250), Duration::milliseconds(5_250));
        assert_eq!(retry_delay(3, 0), Duration::seconds(40));
        assert_eq!(retry_delay(100, 2_000), Duration::seconds(5_121));
    }

    struct FakeGateway {
        pages: Mutex<VecDeque<Result<GoogleCalendarEventPage, GoogleCalendarGatewayError>>>,
        sync_tokens: Mutex<Vec<Option<String>>>,
    }

    #[async_trait]
    impl GoogleCalendarGateway for FakeGateway {
        fn authorization_url(&self, _: &str, _: &str, _: &str) -> String {
            String::new()
        }

        async fn exchange_code(
            &self,
            _: &str,
            _: &PlainSecret,
            _: &str,
        ) -> Result<GoogleOAuthCredentials, GoogleCalendarGatewayError> {
            Err(GoogleCalendarGatewayError::Unexpected)
        }

        async fn list_calendars(
            &self,
            _: &PlainSecret,
        ) -> Result<Vec<GoogleCalendarListEntry>, GoogleCalendarGatewayError> {
            Ok(Vec::new())
        }

        async fn list_events(
            &self,
            _: &PlainSecret,
            _: &str,
            sync_token: Option<&str>,
            _: Option<&str>,
            _: chrono::DateTime<Utc>,
        ) -> Result<GoogleCalendarEventPage, GoogleCalendarGatewayError> {
            self.sync_tokens
                .lock()
                .unwrap()
                .push(sync_token.map(str::to_string));
            self.pages.lock().unwrap().pop_front().unwrap()
        }

        async fn watch_events(
            &self,
            _: &PlainSecret,
            _: &str,
            _: &str,
            _: &str,
            _: &str,
            _: chrono::DateTime<Utc>,
        ) -> Result<GoogleWatchChannel, GoogleCalendarGatewayError> {
            Err(GoogleCalendarGatewayError::Unexpected)
        }

        async fn stop_channel(
            &self,
            _: &PlainSecret,
            _: &str,
            _: &str,
        ) -> Result<(), GoogleCalendarGatewayError> {
            Ok(())
        }

        async fn revoke(&self, _: &PlainSecret) -> Result<(), GoogleCalendarGatewayError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn a_gone_sync_token_forces_a_clean_full_sync() {
        let fake = Arc::new(FakeGateway {
            pages: Mutex::new(VecDeque::from([
                Err(GoogleCalendarGatewayError::Gone),
                Ok(GoogleCalendarEventPage {
                    events: Vec::new(),
                    next_page_token: None,
                    next_sync_token: Some("fresh-token".into()),
                }),
            ])),
            sync_tokens: Mutex::new(Vec::new()),
        });
        let gateway: Arc<dyn GoogleCalendarGateway> = fake.clone();
        let (_, next, full_sync) = fetch_with_full_sync_fallback(
            &gateway,
            &PlainSecret::new("secret".into()),
            "calendar",
            Some("stale-token"),
            Utc.with_ymd_and_hms(2026, 7, 31, 0, 0, 0).unwrap(),
        )
        .await
        .unwrap();

        assert!(full_sync);
        assert_eq!(next, "fresh-token");
        assert_eq!(
            *fake.sync_tokens.lock().unwrap(),
            vec![Some("stale-token".into()), None]
        );
    }
}
