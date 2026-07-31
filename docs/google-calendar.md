# Google Calendar

The calendar view combines three sources without creating event blocks:

- private Google events for the connected user;
- Google events explicitly linked to shared `database_row` notes;
- manual database rows using the selected `date` property.

Google is read-only. Reason remains the source of truth for notes, decisions,
tasks, tags, and internal status. A linked row and its minimal meeting snapshot
survive cancellation, source removal, and account disconnection.

## Local configuration

Create an OAuth web client in Google Cloud and enable the Calendar API. Add this
callback URI exactly:

```text
http://localhost:18080/integrations/google-calendar/oauth/callback
```

Generate a 32-byte key and put the base64url value after a stable key ID:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Configure `.env`:

```text
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
GOOGLE_CALENDAR_ENCRYPTION_KEYS=local-1:...
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:18080/integrations/google-calendar/oauth/callback
GOOGLE_CALENDAR_WEBHOOK_URL=https://PUBLIC_HTTPS_API/integrations/google-calendar/webhook
NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true
```

Google push notifications require a public HTTPS webhook. Initial and periodic
sync still work locally without one only when the Google watch request can reach
the configured URL. Use a tunnel when exercising push notifications.

Start the API, regular worker, Google Calendar worker, and web client:

```bash
make dev
```

For a host-native worker run:

```bash
cd backend
cargo run --bin google-calendar-worker
```

## Key rotation

The first entry is the active encryption key. Keep previous keys after it until
all stored refresh tokens have been reconnected or re-encrypted:

```text
GOOGLE_CALENDAR_ENCRYPTION_KEYS=new-2:NEW_KEY,old-1:OLD_KEY
```

Refresh tokens are encrypted with AES-256-GCM and user-bound associated data.
Access tokens only exist in process memory. Do not log either token, event titles,
descriptions, or attendees.

## Production checklist

- Use separate Google Cloud projects for staging and production.
- Configure the four scopes listed in `docs/protocolo.md` and complete Google
  OAuth verification before public rollout.
- Use different encryption keys per environment and store them in the platform's
  secret manager.
- Deploy `google-calendar-worker` independently from the API.
- Point the webhook URL to the public API and renew channels before expiration.
- Enable the frontend flag progressively.
- Alert on `google_calendar_sync_failures_total` and sync lag without including
  event content or user tokens in telemetry.
