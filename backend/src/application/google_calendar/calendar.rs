use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::Duration;
use serde::Deserialize;
use uuid::Uuid;

use crate::application::AppError;
use crate::application::ports::clock::Clock;
use crate::application::ports::google_calendar::{
    GoogleCalendarGateway, GoogleCalendarRepository, LinkGoogleCalendarEvent,
    ReplaceGoogleCalendarSources, SecretCipher,
};
use crate::application::ports::workspace::WorkspaceRepository;
use crate::application::workspaces::permissions::{require_member, require_writer};
use crate::domain::error::DomainError;
use crate::domain::google_calendar::{
    CalendarEventOrigin, CalendarProjectionEvent, GoogleCalendarEventLink, GoogleCalendarOption,
    GoogleCalendarSources, ResolvedGoogleCalendarSource, SelectedGoogleCalendar,
    parse_database_date, validate_projection_range,
};

#[derive(Debug, Clone, Deserialize)]
pub struct ReplaceCalendarSourcesInput {
    pub sources: Vec<SelectedGoogleCalendar>,
}

#[derive(Debug, Clone)]
pub struct ListCalendarEventsInput {
    pub start: String,
    pub end: String,
    pub time_zone: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkCalendarNotesInput {
    pub op_id: Uuid,
    pub row_id: Uuid,
    pub source_id: Uuid,
    pub google_event_id: String,
}

#[derive(Clone)]
pub struct GoogleCalendarUseCases {
    repository: Arc<dyn GoogleCalendarRepository>,
    gateway: Option<Arc<dyn GoogleCalendarGateway>>,
    cipher: Option<Arc<dyn SecretCipher>>,
    workspaces: Arc<dyn WorkspaceRepository>,
    clock: Arc<dyn Clock>,
}

impl GoogleCalendarUseCases {
    pub fn new(
        repository: Arc<dyn GoogleCalendarRepository>,
        gateway: Option<Arc<dyn GoogleCalendarGateway>>,
        cipher: Option<Arc<dyn SecretCipher>>,
        workspaces: Arc<dyn WorkspaceRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            repository,
            gateway,
            cipher,
            workspaces,
            clock,
        }
    }

    pub async fn sources(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        database_id: Uuid,
    ) -> Result<GoogleCalendarSources, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        self.ensure_database(workspace_id, database_id).await?;
        let sources = self
            .repository
            .list_sources(workspace_id, database_id, user_id)
            .await?;
        let mut available = Vec::new();
        if let (Some(gateway), Some(cipher)) = (&self.gateway, &self.cipher) {
            for connection in self.repository.list_connections(user_id).await? {
                if connection.revoked_at.is_some() {
                    continue;
                }
                let Some(secret) = self
                    .repository
                    .find_connection_secret(user_id, connection.id)
                    .await?
                else {
                    continue;
                };
                let Ok(refresh_token) = cipher.decrypt(user_id, &secret.refresh_token) else {
                    continue;
                };
                let Ok(calendars) = gateway.list_calendars(&refresh_token).await else {
                    continue;
                };
                available.extend(calendars.into_iter().map(|calendar| GoogleCalendarOption {
                    connection_id: connection.id,
                    google_calendar_id: calendar.id,
                    display_name: calendar.name,
                    color: calendar.color,
                    primary: calendar.primary,
                }));
            }
        }
        Ok(GoogleCalendarSources {
            configured: self.gateway.is_some() && self.cipher.is_some(),
            sources,
            available,
        })
    }

    pub async fn replace_sources(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        database_id: Uuid,
        input: ReplaceCalendarSourcesInput,
    ) -> Result<GoogleCalendarSources, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        self.ensure_database(workspace_id, database_id).await?;
        if input.sources.len() > 50 {
            return Err(DomainError::Validation("At most 50 calendars can be selected").into());
        }
        let unique = input
            .sources
            .iter()
            .map(|source| (source.connection_id, source.google_calendar_id.as_str()))
            .collect::<HashSet<_>>();
        if unique.len() != input.sources.len()
            || input.sources.iter().any(|source| {
                source.google_calendar_id.is_empty() || source.google_calendar_id.len() > 1024
            })
        {
            return Err(DomainError::Validation("Calendar selection is invalid").into());
        }
        if input.sources.is_empty() {
            let now = self.clock.now();
            self.repository
                .replace_sources(ReplaceGoogleCalendarSources {
                    workspace_id,
                    database_block_id: database_id,
                    user_id,
                    sources: Vec::new(),
                    sync_from: now - Duration::days(365),
                    now,
                })
                .await?;
            return self.sources(user_id, workspace_id, database_id).await;
        }
        let gateway = self
            .gateway
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let cipher = self
            .cipher
            .as_ref()
            .ok_or(AppError::GoogleCalendarNotConfigured)?;
        let mut by_connection: HashMap<Uuid, Vec<&SelectedGoogleCalendar>> = HashMap::new();
        for source in &input.sources {
            by_connection
                .entry(source.connection_id)
                .or_default()
                .push(source);
        }
        let mut resolved = Vec::with_capacity(input.sources.len());
        for (connection_id, selected) in by_connection {
            let secret = self
                .repository
                .find_connection_secret(user_id, connection_id)
                .await?
                .ok_or(AppError::GoogleCalendarConnectionNotFound)?;
            let refresh_token = cipher
                .decrypt(user_id, &secret.refresh_token)
                .map_err(|_| AppError::Internal)?;
            let calendars = gateway
                .list_calendars(&refresh_token)
                .await
                .map_err(super::oauth::map_gateway_error)?;
            for source in selected {
                let calendar = calendars
                    .iter()
                    .find(|calendar| calendar.id == source.google_calendar_id)
                    .ok_or(DomainError::Validation(
                        "Selected calendar is not accessible",
                    ))?;
                resolved.push(ResolvedGoogleCalendarSource {
                    id: Uuid::new_v4(),
                    connection_id,
                    google_calendar_id: calendar.id.clone(),
                    display_name: calendar.name.clone(),
                    color: calendar.color.clone(),
                });
            }
        }
        let now = self.clock.now();
        self.repository
            .replace_sources(ReplaceGoogleCalendarSources {
                workspace_id,
                database_block_id: database_id,
                user_id,
                sources: resolved,
                sync_from: now - Duration::days(365),
                now,
            })
            .await?;
        self.sources(user_id, workspace_id, database_id).await
    }

    pub async fn events(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        database_id: Uuid,
        input: ListCalendarEventsInput,
    ) -> Result<Vec<CalendarProjectionEvent>, AppError> {
        require_member(&self.workspaces, workspace_id, user_id).await?;
        self.ensure_database(workspace_id, database_id).await?;
        if input.time_zone.is_empty() || input.time_zone.len() > 100 {
            return Err(DomainError::Validation("Calendar time zone is invalid").into());
        }
        let (start, end) = validate_projection_range(&input.start, &input.end)?;
        let external = self
            .repository
            .list_external_events(
                workspace_id,
                database_id,
                user_id,
                start,
                end,
                &input.time_zone,
            )
            .await?;
        let manual = self
            .repository
            .list_manual_rows(workspace_id, database_id)
            .await?;
        let mut events = external
            .into_iter()
            .map(|event| {
                let all_day = event.all_day;
                CalendarProjectionEvent {
                    id: format!("google:{}:{}", event.source_id, event.google_event_id),
                    origin: if event.row_id.is_some() {
                        CalendarEventOrigin::Materialized
                    } else {
                        CalendarEventOrigin::Google
                    },
                    row_id: event.row_id,
                    source_id: Some(event.source_id),
                    google_event_id: Some(event.google_event_id),
                    title: event.title,
                    start: event
                        .start_date
                        .map(|date| date.format("%Y-%m-%d").to_string())
                        .unwrap_or_else(|| event.starts_at.to_rfc3339()),
                    end: event
                        .end_date
                        .map(|date| date.format("%Y-%m-%d").to_string())
                        .unwrap_or_else(|| event.ends_at.to_rfc3339()),
                    time_zone: event.time_zone,
                    all_day,
                    status: event.status,
                    meet_url: event.meet_url,
                    location: event.location,
                    google_url: event.google_url,
                    color: event.color,
                    private: event.private,
                }
            })
            .collect::<Vec<_>>();
        for row in manual {
            let Some(value) = row.properties.get(&row.date_property_id) else {
                continue;
            };
            let Ok(range) = parse_database_date(value) else {
                continue;
            };
            if range.start >= end || range.end <= start {
                continue;
            }
            events.push(CalendarProjectionEvent {
                id: format!("row:{}", row.row_id),
                origin: CalendarEventOrigin::Manual,
                row_id: Some(row.row_id),
                source_id: None,
                google_event_id: None,
                title: if row.title.trim().is_empty() {
                    "Untitled".into()
                } else {
                    row.title
                },
                start: range.start_value(),
                end: range.end_value(),
                time_zone: range.time_zone,
                all_day: range.all_day,
                status: "confirmed".into(),
                meet_url: None,
                location: None,
                google_url: None,
                color: None,
                private: false,
            });
        }
        events.sort_by(|left, right| {
            left.start
                .cmp(&right.start)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(events)
    }

    pub async fn link_notes(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        database_id: Uuid,
        input: LinkCalendarNotesInput,
    ) -> Result<GoogleCalendarEventLink, AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        if input.google_event_id.is_empty() || input.google_event_id.len() > 1024 {
            return Err(DomainError::Validation("Google event id is invalid").into());
        }
        self.repository
            .link_event(LinkGoogleCalendarEvent {
                id: Uuid::new_v4(),
                op_id: input.op_id,
                workspace_id,
                database_block_id: database_id,
                database_row_id: input.row_id,
                source_id: input.source_id,
                google_event_id: input.google_event_id,
                linked_by: user_id,
                now: self.clock.now(),
            })
            .await
            .map_err(|error| match error {
                crate::application::ports::RepositoryError::NotFound => {
                    AppError::GoogleCalendarEventNotFound
                }
                other => other.into(),
            })
    }

    pub async fn unlink_notes(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        database_id: Uuid,
        row_id: Uuid,
    ) -> Result<(), AppError> {
        require_writer(&self.workspaces, workspace_id, user_id).await?;
        if self
            .repository
            .unlink_event(workspace_id, database_id, row_id)
            .await?
        {
            Ok(())
        } else {
            Err(AppError::GoogleCalendarEventNotFound)
        }
    }

    pub async fn webhook(
        &self,
        channel_id: &str,
        resource_id: &str,
        token: &str,
        message_number: i64,
    ) -> Result<bool, AppError> {
        if channel_id.is_empty()
            || channel_id.len() > 255
            || resource_id.is_empty()
            || resource_id.len() > 2048
            || token.is_empty()
            || token.len() > 256
            || message_number <= 0
        {
            return Ok(false);
        }
        self.repository
            .enqueue_webhook(
                channel_id,
                resource_id,
                &super::oauth::sha256_hex(token),
                message_number,
                self.clock.now(),
            )
            .await
            .map_err(Into::into)
    }

    async fn ensure_database(&self, workspace_id: Uuid, database_id: Uuid) -> Result<(), AppError> {
        if self
            .repository
            .find_database_page(workspace_id, database_id)
            .await?
            .is_some()
        {
            Ok(())
        } else {
            Err(DomainError::Validation(
                "Calendar target must be a live database in this workspace",
            )
            .into())
        }
    }
}
