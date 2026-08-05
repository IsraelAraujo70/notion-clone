use std::time::Duration as StdDuration;

use chrono::{DateTime, TimeZone, Utc};
use reqwest::{Client, Response, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use url::Url;

use crate::application::ports::google_calendar::{
    GoogleCalendarEvent, GoogleCalendarEventPage, GoogleCalendarGateway,
    GoogleCalendarGatewayError, GoogleCalendarListEntry, GoogleOAuthCredentials,
    GoogleWatchChannel, PlainSecret,
};
use crate::domain::google_calendar::{GOOGLE_CALENDAR_SCOPES, parse_database_date};

const REQUEST_TIMEOUT_SECONDS: u64 = 20;
const MAX_CALENDAR_LIST_PAGES: usize = 100;

#[derive(Debug, Clone)]
pub struct GoogleCalendarEndpoints {
    pub authorization_url: String,
    pub token_url: String,
    pub revoke_url: String,
    pub userinfo_url: String,
    pub calendar_api_url: String,
}

pub struct ReqwestGoogleCalendarGateway {
    client: Client,
    client_id: String,
    client_secret: String,
    endpoints: GoogleCalendarEndpoints,
}

impl ReqwestGoogleCalendarGateway {
    pub fn new(
        client_id: String,
        client_secret: String,
        endpoints: GoogleCalendarEndpoints,
    ) -> Result<Self, GoogleCalendarGatewayError> {
        for value in [
            &endpoints.authorization_url,
            &endpoints.token_url,
            &endpoints.revoke_url,
            &endpoints.userinfo_url,
            &endpoints.calendar_api_url,
        ] {
            Url::parse(value).map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        }
        Ok(Self {
            client: Client::builder()
                .timeout(StdDuration::from_secs(REQUEST_TIMEOUT_SECONDS))
                .build()
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
            client_id,
            client_secret,
            endpoints,
        })
    }

    async fn access_token(
        &self,
        refresh_token: &PlainSecret,
    ) -> Result<PlainSecret, GoogleCalendarGatewayError> {
        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
        }
        let response = self
            .client
            .post(&self.endpoints.token_url)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("refresh_token", refresh_token.expose()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        let response = checked(response).await?;
        let token = response
            .json::<TokenResponse>()
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?
            .access_token;
        if token.is_empty() {
            return Err(GoogleCalendarGatewayError::Unauthorized);
        }
        Ok(PlainSecret::new(token))
    }

    fn calendar_url(&self, segments: &[&str]) -> Result<Url, GoogleCalendarGatewayError> {
        let mut url = Url::parse(&self.endpoints.calendar_api_url)
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        url.path_segments_mut()
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?
            .pop_if_empty()
            .extend(segments);
        Ok(url)
    }
}

#[async_trait::async_trait]
impl GoogleCalendarGateway for ReqwestGoogleCalendarGateway {
    fn authorization_url(&self, state: &str, code_challenge: &str, redirect_uri: &str) -> String {
        let mut url = Url::parse(&self.endpoints.authorization_url)
            .expect("Google authorization URL was validated at construction");
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", &GOOGLE_CALENDAR_SCOPES.join(" "))
            .append_pair("access_type", "offline")
            .append_pair("include_granted_scopes", "true")
            .append_pair("prompt", "consent")
            .append_pair("state", state)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256");
        url.into()
    }

    async fn exchange_code(
        &self,
        code: &str,
        code_verifier: &PlainSecret,
        redirect_uri: &str,
    ) -> Result<GoogleOAuthCredentials, GoogleCalendarGatewayError> {
        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            refresh_token: Option<String>,
            scope: Option<String>,
        }
        #[derive(Deserialize)]
        struct UserInfoResponse {
            sub: String,
            email: String,
        }
        let response = self
            .client
            .post(&self.endpoints.token_url)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("code_verifier", code_verifier.expose()),
                ("grant_type", "authorization_code"),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        if !response.status().is_success() {
            tracing::warn!(
                event = "google_calendar_oauth_token_exchange_failed",
                status = %response.status(),
            );
        }
        let token = checked(response)
            .await?
            .json::<TokenResponse>()
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        let refresh_token = match token.refresh_token.filter(|value| !value.is_empty()) {
            Some(refresh_token) => refresh_token,
            None => {
                tracing::warn!(event = "google_calendar_oauth_refresh_token_missing");
                return Err(GoogleCalendarGatewayError::Unauthorized);
            }
        };
        if token.access_token.is_empty() {
            tracing::warn!(event = "google_calendar_oauth_access_token_missing");
            return Err(GoogleCalendarGatewayError::Unauthorized);
        }
        let userinfo = checked(
            self.client
                .get(&self.endpoints.userinfo_url)
                .bearer_auth(&token.access_token)
                .send()
                .await
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
        )
        .await?
        .json::<UserInfoResponse>()
        .await
        .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        if userinfo.sub.is_empty() || !userinfo.email.contains('@') {
            tracing::warn!(event = "google_calendar_oauth_userinfo_invalid");
            return Err(GoogleCalendarGatewayError::Unauthorized);
        }
        let granted_scopes = token
            .scope
            .unwrap_or_default()
            .split_whitespace()
            .map(str::to_string)
            .collect();
        Ok(GoogleOAuthCredentials {
            google_account_id: userinfo.sub,
            account_email: userinfo.email,
            refresh_token: PlainSecret::new(refresh_token),
            granted_scopes,
        })
    }

    async fn list_calendars(
        &self,
        refresh_token: &PlainSecret,
    ) -> Result<Vec<GoogleCalendarListEntry>, GoogleCalendarGatewayError> {
        #[derive(Deserialize)]
        struct CalendarListResponse {
            #[serde(default)]
            items: Vec<CalendarListItem>,
            #[serde(rename = "nextPageToken")]
            next_page_token: Option<String>,
        }
        #[derive(Deserialize)]
        struct CalendarListItem {
            id: String,
            summary: String,
            #[serde(rename = "backgroundColor")]
            background_color: Option<String>,
            #[serde(default)]
            primary: bool,
            #[serde(rename = "accessRole")]
            access_role: Option<String>,
            #[serde(default)]
            deleted: bool,
        }

        let access_token = self.access_token(refresh_token).await?;
        let mut calendars = Vec::new();
        let mut page_token = None;
        for _ in 0..MAX_CALENDAR_LIST_PAGES {
            let mut url = self.calendar_url(&["users", "me", "calendarList"])?;
            {
                let mut query = url.query_pairs_mut();
                query.append_pair("maxResults", "250");
                query.append_pair("showDeleted", "false");
                query.append_pair("showHidden", "false");
                if let Some(token) = page_token.as_deref() {
                    query.append_pair("pageToken", token);
                }
            }
            let page = checked(
                self.client
                    .get(url)
                    .bearer_auth(access_token.expose())
                    .send()
                    .await
                    .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
            )
            .await?
            .json::<CalendarListResponse>()
            .await
            .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
            calendars.extend(page.items.into_iter().filter_map(|item| {
                if item.deleted
                    || item.id.is_empty()
                    || item.id.len() > 1024
                    || matches!(item.access_role.as_deref(), Some("none" | "freeBusyReader"))
                {
                    return None;
                }
                Some(GoogleCalendarListEntry {
                    id: item.id,
                    name: if item.summary.trim().is_empty() {
                        "Untitled calendar".into()
                    } else {
                        limited(&item.summary, 255)
                    },
                    color: item.background_color.filter(|value| valid_color(value)),
                    primary: item.primary,
                })
            }));
            page_token = page.next_page_token;
            if page_token.is_none() {
                return Ok(calendars);
            }
        }
        Err(GoogleCalendarGatewayError::Unexpected)
    }

    async fn list_events(
        &self,
        refresh_token: &PlainSecret,
        calendar_id: &str,
        sync_token: Option<&str>,
        page_token: Option<&str>,
        sync_from: DateTime<Utc>,
    ) -> Result<GoogleCalendarEventPage, GoogleCalendarGatewayError> {
        let access_token = self.access_token(refresh_token).await?;
        let mut url = self.calendar_url(&["calendars", calendar_id, "events"])?;
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("maxResults", "2500")
                .append_pair("singleEvents", "true")
                .append_pair("showDeleted", "true");
            if let Some(token) = sync_token {
                query.append_pair("syncToken", token);
            } else {
                query.append_pair("timeMin", &sync_from.to_rfc3339());
            }
            if let Some(token) = page_token {
                query.append_pair("pageToken", token);
            }
        }
        let response = checked(
            self.client
                .get(url)
                .bearer_auth(access_token.expose())
                .send()
                .await
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
        )
        .await?
        .json::<EventsResponse>()
        .await
        .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        let events = response
            .items
            .into_iter()
            .map(parse_event)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(GoogleCalendarEventPage {
            events,
            next_page_token: response.next_page_token,
            next_sync_token: response.next_sync_token,
        })
    }

    async fn watch_events(
        &self,
        refresh_token: &PlainSecret,
        calendar_id: &str,
        channel_id: &str,
        channel_token: &str,
        webhook_url: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<GoogleWatchChannel, GoogleCalendarGatewayError> {
        #[derive(Deserialize)]
        struct WatchResponse {
            id: String,
            #[serde(rename = "resourceId")]
            resource_id: String,
            expiration: Value,
        }
        let access_token = self.access_token(refresh_token).await?;
        let response = checked(
            self.client
                .post(self.calendar_url(&["calendars", calendar_id, "events", "watch"])?)
                .bearer_auth(access_token.expose())
                .json(&json!({
                    "id": channel_id,
                    "type": "web_hook",
                    "address": webhook_url,
                    "token": channel_token,
                    "expiration": expires_at.timestamp_millis().to_string()
                }))
                .send()
                .await
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
        )
        .await?
        .json::<WatchResponse>()
        .await
        .map_err(|_| GoogleCalendarGatewayError::Unexpected)?;
        let expiration_ms = response
            .expiration
            .as_i64()
            .or_else(|| response.expiration.as_str()?.parse().ok())
            .ok_or(GoogleCalendarGatewayError::Unexpected)?;
        let expires_at = Utc
            .timestamp_millis_opt(expiration_ms)
            .single()
            .ok_or(GoogleCalendarGatewayError::Unexpected)?;
        if response.id != channel_id || response.resource_id.is_empty() {
            return Err(GoogleCalendarGatewayError::Unexpected);
        }
        Ok(GoogleWatchChannel {
            channel_id: response.id,
            resource_id: response.resource_id,
            expires_at,
        })
    }

    async fn stop_channel(
        &self,
        refresh_token: &PlainSecret,
        channel_id: &str,
        resource_id: &str,
    ) -> Result<(), GoogleCalendarGatewayError> {
        let access_token = self.access_token(refresh_token).await?;
        checked(
            self.client
                .post(self.calendar_url(&["channels", "stop"])?)
                .bearer_auth(access_token.expose())
                .json(&json!({"id": channel_id, "resourceId": resource_id}))
                .send()
                .await
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
        )
        .await?;
        Ok(())
    }

    async fn revoke(&self, refresh_token: &PlainSecret) -> Result<(), GoogleCalendarGatewayError> {
        checked(
            self.client
                .post(&self.endpoints.revoke_url)
                .form(&[("token", refresh_token.expose())])
                .send()
                .await
                .map_err(|_| GoogleCalendarGatewayError::Unexpected)?,
        )
        .await?;
        Ok(())
    }
}

#[derive(Deserialize)]
struct EventsResponse {
    #[serde(default)]
    items: Vec<EventResponse>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
    #[serde(rename = "nextSyncToken")]
    next_sync_token: Option<String>,
}

#[derive(Deserialize)]
struct EventResponse {
    id: String,
    #[serde(rename = "iCalUID")]
    ical_uid: Option<String>,
    #[serde(rename = "recurringEventId")]
    recurring_event_id: Option<String>,
    #[serde(rename = "originalStartTime")]
    original_start_time: Option<EventDateTime>,
    summary: Option<String>,
    start: Option<EventDateTime>,
    end: Option<EventDateTime>,
    status: Option<String>,
    #[serde(rename = "hangoutLink")]
    hangout_link: Option<String>,
    location: Option<String>,
    #[serde(rename = "htmlLink")]
    html_link: Option<String>,
    etag: Option<String>,
    updated: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct EventDateTime {
    date: Option<String>,
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    #[serde(rename = "timeZone")]
    time_zone: Option<String>,
}

fn parse_event(value: EventResponse) -> Result<GoogleCalendarEvent, GoogleCalendarGatewayError> {
    if value.id.is_empty() || value.id.len() > 1024 {
        return Err(GoogleCalendarGatewayError::Unexpected);
    }
    let status = match value.status.as_deref() {
        Some("cancelled") => "cancelled",
        Some("tentative") => "tentative",
        _ => "confirmed",
    }
    .to_string();
    let range = match (value.start.as_ref(), value.end.as_ref()) {
        (Some(start), Some(end)) => Some(parse_event_range(start, end)?),
        _ if status == "cancelled" => None,
        _ => return Err(GoogleCalendarGatewayError::Unexpected),
    };
    Ok(GoogleCalendarEvent {
        id: value.id,
        ical_uid: value.ical_uid.map(|value| limited(&value, 1024)),
        recurring_event_id: value.recurring_event_id.map(|value| limited(&value, 1024)),
        original_start_at: value.original_start_time.and_then(|value| {
            value
                .date
                .or(value.date_time)
                .map(|value| limited(&value, 128))
        }),
        title: limited(value.summary.as_deref().unwrap_or("Untitled event"), 4000),
        range,
        status,
        meet_url: value.hangout_link.map(|value| limited(&value, 4000)),
        location: value.location.map(|value| limited(&value, 4000)),
        google_url: value.html_link.map(|value| limited(&value, 4000)),
        etag: value.etag.map(|value| limited(&value, 1024)),
        updated_at: value.updated,
    })
}

fn parse_event_range(
    start: &EventDateTime,
    end: &EventDateTime,
) -> Result<crate::domain::google_calendar::CalendarDateRange, GoogleCalendarGatewayError> {
    let value = if let (Some(start), Some(end)) = (&start.date, &end.date) {
        json!({
            "start": start,
            "end": end,
            "allDay": true
        })
    } else if let (Some(start_value), Some(end_value)) = (&start.date_time, &end.date_time) {
        json!({
            "start": start_value,
            "end": end_value,
            "timeZone": start.time_zone.as_deref().or(end.time_zone.as_deref())
        })
    } else {
        return Err(GoogleCalendarGatewayError::Unexpected);
    };
    parse_database_date(&value).map_err(|_| GoogleCalendarGatewayError::Unexpected)
}

async fn checked(response: Response) -> Result<Response, GoogleCalendarGatewayError> {
    match response.status() {
        status if status.is_success() => Ok(response),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::BAD_REQUEST => {
            Err(GoogleCalendarGatewayError::Unauthorized)
        }
        StatusCode::GONE => Err(GoogleCalendarGatewayError::Gone),
        StatusCode::TOO_MANY_REQUESTS => Err(GoogleCalendarGatewayError::RateLimited),
        _ => Err(GoogleCalendarGatewayError::Unexpected),
    }
}

fn limited(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gateway() -> ReqwestGoogleCalendarGateway {
        ReqwestGoogleCalendarGateway::new(
            "client-id".into(),
            "client-secret".into(),
            GoogleCalendarEndpoints {
                authorization_url: "https://accounts.google.com/o/oauth2/v2/auth".into(),
                token_url: "https://oauth2.googleapis.com/token".into(),
                revoke_url: "https://oauth2.googleapis.com/revoke".into(),
                userinfo_url: "https://openidconnect.googleapis.com/v1/userinfo".into(),
                calendar_api_url: "https://www.googleapis.com/calendar/v3".into(),
            },
        )
        .unwrap()
    }

    #[test]
    fn authorization_url_uses_pkce_offline_and_minimal_scopes() {
        let url = Url::parse(&gateway().authorization_url(
            "state-value",
            "challenge-value",
            "https://reason.test/integrations/google-calendar/oauth/callback",
        ))
        .unwrap();
        let query = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(
            query.get("access_type").map(|value| value.as_ref()),
            Some("offline")
        );
        assert_eq!(
            query
                .get("code_challenge_method")
                .map(|value| value.as_ref()),
            Some("S256")
        );
        assert_eq!(
            query.get("state").map(|value| value.as_ref()),
            Some("state-value")
        );
        let scopes = query.get("scope").unwrap();
        for scope in GOOGLE_CALENDAR_SCOPES {
            assert!(scopes.split_whitespace().any(|value| value == scope));
        }
    }

    #[test]
    fn parses_recurring_timed_and_all_day_events_without_attendees() {
        let timed: EventResponse = serde_json::from_value(json!({
            "id": "event-1_20260731T170000Z",
            "iCalUID": "event-1@example.com",
            "recurringEventId": "event-1",
            "originalStartTime": {"dateTime": "2026-07-31T14:00:00-03:00"},
            "summary": "Weekly sync",
            "start": {"dateTime": "2026-07-31T15:00:00-03:00", "timeZone": "America/Sao_Paulo"},
            "end": {"dateTime": "2026-07-31T16:00:00-03:00", "timeZone": "America/Sao_Paulo"},
            "status": "confirmed",
            "attendees": [{"email": "private@example.com"}]
        }))
        .unwrap();
        let timed = parse_event(timed).unwrap();
        assert_eq!(timed.recurring_event_id.as_deref(), Some("event-1"));
        assert_eq!(
            timed.range.unwrap().start.to_rfc3339(),
            "2026-07-31T18:00:00+00:00"
        );

        let all_day: EventResponse = serde_json::from_value(json!({
            "id": "all-day",
            "summary": "Planning day",
            "start": {"date": "2026-08-01"},
            "end": {"date": "2026-08-02"},
            "status": "tentative"
        }))
        .unwrap();
        let all_day = parse_event(all_day).unwrap();
        assert!(all_day.range.unwrap().all_day);
    }

    #[test]
    fn accepts_sparse_cancelled_events_for_incremental_sync() {
        let cancelled: EventResponse = serde_json::from_value(json!({
            "id": "deleted-occurrence",
            "status": "cancelled",
            "recurringEventId": "series",
            "originalStartTime": {"date": "2026-08-01"}
        }))
        .unwrap();
        let cancelled = parse_event(cancelled).unwrap();
        assert_eq!(cancelled.status, "cancelled");
        assert!(cancelled.range.is_none());
        assert_eq!(cancelled.original_start_at.as_deref(), Some("2026-08-01"));
    }
}
