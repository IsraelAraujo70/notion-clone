use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::error::DomainError;

pub const GOOGLE_CALENDAR_SCOPES: [&str; 4] = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
];

const INVALID_DATE_VALUE: &str =
    "Calendar dates must be YYYY-MM-DD or RFC3339 values with an explicit offset";
const INVALID_CALENDAR_RANGE: &str = "Calendar end must be after start";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GoogleCalendarConnection {
    pub id: Uuid,
    pub google_account_id: String,
    pub account_email: String,
    pub granted_scopes: Vec<String>,
    pub connected_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GoogleCalendarSource {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub database_block_id: Uuid,
    pub connection_id: Uuid,
    pub google_calendar_id: String,
    pub display_name: String,
    pub color: Option<String>,
    pub enabled: bool,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GoogleCalendarOption {
    pub connection_id: Uuid,
    pub google_calendar_id: String,
    pub display_name: String,
    pub color: Option<String>,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GoogleCalendarSources {
    pub configured: bool,
    pub sources: Vec<GoogleCalendarSource>,
    pub available: Vec<GoogleCalendarOption>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct SelectedGoogleCalendar {
    pub connection_id: Uuid,
    pub google_calendar_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedGoogleCalendarSource {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub google_calendar_id: String,
    pub display_name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarEventOrigin {
    Google,
    Materialized,
    Manual,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CalendarProjectionEvent {
    pub id: String,
    pub origin: CalendarEventOrigin,
    pub row_id: Option<Uuid>,
    pub source_id: Option<Uuid>,
    pub google_event_id: Option<String>,
    pub title: String,
    pub start: String,
    pub end: String,
    pub time_zone: Option<String>,
    pub all_day: bool,
    pub status: String,
    pub meet_url: Option<String>,
    pub location: Option<String>,
    pub google_url: Option<String>,
    pub color: Option<String>,
    pub private: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GoogleCalendarEventLink {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub database_block_id: Uuid,
    pub database_row_id: Uuid,
    pub source_id: Uuid,
    pub google_event_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarDateRange {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub time_zone: Option<String>,
    pub all_day: bool,
}

impl CalendarDateRange {
    pub fn start_value(&self) -> String {
        self.start_date
            .map(|date| date.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| self.start.to_rfc3339())
    }

    pub fn end_value(&self) -> String {
        self.end_date
            .map(|date| date.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| self.end.to_rfc3339())
    }
}

pub fn parse_database_date(value: &Value) -> Result<CalendarDateRange, DomainError> {
    if let Some(date) = value.as_str() {
        return all_day_range(date, None, None);
    }
    let object = value
        .as_object()
        .ok_or(DomainError::Validation(INVALID_DATE_VALUE))?;
    let start = object
        .get("start")
        .and_then(Value::as_str)
        .ok_or(DomainError::Validation(INVALID_DATE_VALUE))?;
    let end = object.get("end").and_then(Value::as_str);
    let time_zone = object
        .get("timeZone")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 100)
        .map(str::to_string);
    let all_day = object
        .get("allDay")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || NaiveDate::parse_from_str(start, "%Y-%m-%d").is_ok();
    if all_day {
        return all_day_range(start, end, time_zone);
    }
    let start = DateTime::parse_from_rfc3339(start)
        .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?
        .with_timezone(&Utc);
    let end = match end {
        Some(value) => DateTime::parse_from_rfc3339(value)
            .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?
            .with_timezone(&Utc),
        None => start + Duration::hours(1),
    };
    if end <= start {
        return Err(DomainError::Validation(INVALID_CALENDAR_RANGE));
    }
    Ok(CalendarDateRange {
        start,
        end,
        start_date: None,
        end_date: None,
        time_zone,
        all_day: false,
    })
}

pub fn validate_projection_range(
    start: &str,
    end: &str,
) -> Result<(DateTime<Utc>, DateTime<Utc>), DomainError> {
    let start = DateTime::parse_from_rfc3339(start)
        .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?
        .with_timezone(&Utc);
    let end = DateTime::parse_from_rfc3339(end)
        .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?
        .with_timezone(&Utc);
    if end <= start || end - start > Duration::days(370) {
        return Err(DomainError::Validation(INVALID_CALENDAR_RANGE));
    }
    Ok((start, end))
}

fn all_day_range(
    start: &str,
    end: Option<&str>,
    time_zone: Option<String>,
) -> Result<CalendarDateRange, DomainError> {
    let start_date = NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?;
    let end_date = match end {
        Some(value) => NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map_err(|_| DomainError::Validation(INVALID_DATE_VALUE))?,
        None => start_date
            .succ_opt()
            .ok_or(DomainError::Validation(INVALID_DATE_VALUE))?,
    };
    if end_date <= start_date {
        return Err(DomainError::Validation(INVALID_CALENDAR_RANGE));
    }
    Ok(CalendarDateRange {
        start: Utc.from_utc_datetime(
            &start_date
                .and_hms_opt(0, 0, 0)
                .ok_or(DomainError::Validation(INVALID_DATE_VALUE))?,
        ),
        end: Utc.from_utc_datetime(
            &end_date
                .and_hms_opt(0, 0, 0)
                .ok_or(DomainError::Validation(INVALID_DATE_VALUE))?,
        ),
        start_date: Some(start_date),
        end_date: Some(end_date),
        time_zone,
        all_day: true,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_legacy_and_rich_database_dates() {
        let legacy = parse_database_date(&json!("2026-07-31")).unwrap();
        assert!(legacy.all_day);
        assert_eq!(legacy.start_value(), "2026-07-31");
        assert_eq!(legacy.end_value(), "2026-08-01");

        let timed = parse_database_date(&json!({
            "start": "2026-07-31T14:00:00-03:00",
            "end": "2026-07-31T15:00:00-03:00",
            "timeZone": "America/Sao_Paulo"
        }))
        .unwrap();
        assert!(!timed.all_day);
        assert_eq!(timed.start.to_rfc3339(), "2026-07-31T17:00:00+00:00");
    }

    #[test]
    fn rejects_invalid_or_inverted_dates() {
        assert!(parse_database_date(&json!("2026-02-30")).is_err());
        assert!(
            parse_database_date(&json!({
                "start": "2026-07-31T15:00:00Z",
                "end": "2026-07-31T14:00:00Z"
            }))
            .is_err()
        );
    }
}
