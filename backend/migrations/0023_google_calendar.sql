-- Google Calendar is a private per-user projection. All workspace-owned rows
-- carry workspace_id so authorization can be enforced in every query.
CREATE TABLE google_calendar_oauth_states (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) = 64),
    pkce_verifier_ciphertext TEXT NOT NULL,
    encryption_key_id TEXT NOT NULL,
    return_database_id UUID NOT NULL,
    return_page_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (return_database_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (return_page_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX google_calendar_oauth_states_user_created_idx
    ON google_calendar_oauth_states(user_id, created_at DESC);

CREATE TABLE google_calendar_connections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_account_id TEXT NOT NULL CHECK (length(google_account_id) BETWEEN 1 AND 255),
    account_email TEXT NOT NULL CHECK (length(account_email) BETWEEN 3 AND 320),
    refresh_token_ciphertext TEXT,
    encryption_key_id TEXT,
    granted_scopes TEXT[] NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    UNIQUE (user_id, google_account_id),
    UNIQUE (id, user_id),
    CHECK ((refresh_token_ciphertext IS NULL) = (encryption_key_id IS NULL)),
    CHECK ((revoked_at IS NULL) = (refresh_token_ciphertext IS NOT NULL))
);

CREATE INDEX google_calendar_connections_user_active_idx
    ON google_calendar_connections(user_id, connected_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE google_calendar_sources (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    database_block_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    user_id UUID NOT NULL,
    google_calendar_id TEXT NOT NULL CHECK (length(google_calendar_id) BETWEEN 1 AND 1024),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
    color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sync_from TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (id, workspace_id),
    UNIQUE (workspace_id, database_block_id, user_id, connection_id, google_calendar_id),
    FOREIGN KEY (database_block_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (connection_id, user_id)
        REFERENCES google_calendar_connections(id, user_id) ON DELETE CASCADE
);

CREATE INDEX google_calendar_sources_database_user_idx
    ON google_calendar_sources(workspace_id, database_block_id, user_id, enabled);

CREATE TABLE google_calendar_sync_states (
    workspace_id UUID NOT NULL,
    source_id UUID NOT NULL,
    next_sync_token TEXT,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    channel_id TEXT UNIQUE,
    webhook_token_hash TEXT CHECK (webhook_token_hash IS NULL OR length(webhook_token_hash) = 64),
    resource_id TEXT,
    channel_expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_message_number BIGINT NOT NULL DEFAULT 0 CHECK (last_message_number >= 0),
    lease_token UUID,
    leased_until TIMESTAMPTZ,
    PRIMARY KEY (workspace_id, source_id),
    FOREIGN KEY (source_id, workspace_id)
        REFERENCES google_calendar_sources(id, workspace_id) ON DELETE CASCADE,
    CHECK ((lease_token IS NULL) = (leased_until IS NULL)),
    CHECK ((channel_id IS NULL) = (webhook_token_hash IS NULL)),
    CHECK ((channel_id IS NULL) = (resource_id IS NULL))
);

CREATE INDEX google_calendar_sync_states_due_idx
    ON google_calendar_sync_states(next_attempt_at)
    WHERE lease_token IS NULL;

CREATE INDEX google_calendar_sync_states_expired_lease_idx
    ON google_calendar_sync_states(leased_until, next_attempt_at)
    WHERE lease_token IS NOT NULL;

CREATE TABLE google_calendar_events (
    workspace_id UUID NOT NULL,
    source_id UUID NOT NULL,
    google_event_id TEXT NOT NULL CHECK (length(google_event_id) BETWEEN 1 AND 1024),
    ical_uid TEXT,
    recurring_event_id TEXT,
    original_start_at TEXT,
    title TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    start_date DATE,
    end_date DATE,
    time_zone TEXT,
    all_day BOOLEAN NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    meet_url TEXT,
    location TEXT,
    google_url TEXT,
    etag TEXT,
    google_updated_at TIMESTAMPTZ,
    cached_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (workspace_id, source_id, google_event_id),
    FOREIGN KEY (source_id, workspace_id)
        REFERENCES google_calendar_sources(id, workspace_id) ON DELETE CASCADE,
    CHECK (ends_at > starts_at),
    CHECK (
        (all_day AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date)
        OR (NOT all_day AND start_date IS NULL AND end_date IS NULL)
    )
);

CREATE INDEX google_calendar_events_projection_idx
    ON google_calendar_events(workspace_id, source_id, starts_at, ends_at);

CREATE TABLE google_calendar_event_links (
    id UUID PRIMARY KEY,
    op_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    database_block_id UUID NOT NULL,
    database_row_id UUID NOT NULL,
    source_id UUID NOT NULL,
    google_event_id TEXT NOT NULL,
    snapshot_title TEXT NOT NULL,
    snapshot_starts_at TIMESTAMPTZ NOT NULL,
    snapshot_ends_at TIMESTAMPTZ NOT NULL,
    snapshot_start_date DATE,
    snapshot_end_date DATE,
    snapshot_time_zone TEXT,
    snapshot_all_day BOOLEAN NOT NULL,
    snapshot_status TEXT NOT NULL CHECK (snapshot_status IN ('confirmed', 'tentative', 'cancelled')),
    snapshot_meet_url TEXT,
    snapshot_google_url TEXT,
    linked_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (workspace_id, op_id),
    UNIQUE (workspace_id, database_block_id, database_row_id),
    UNIQUE (workspace_id, database_block_id, source_id, google_event_id),
    FOREIGN KEY (database_block_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (database_row_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (source_id, workspace_id)
        REFERENCES google_calendar_sources(id, workspace_id) ON DELETE RESTRICT,
    CHECK (snapshot_ends_at > snapshot_starts_at),
    CHECK (
        (snapshot_all_day AND snapshot_start_date IS NOT NULL AND snapshot_end_date IS NOT NULL)
        OR (NOT snapshot_all_day AND snapshot_start_date IS NULL AND snapshot_end_date IS NULL)
    )
);

CREATE INDEX google_calendar_event_links_projection_idx
    ON google_calendar_event_links(workspace_id, database_block_id, snapshot_starts_at, snapshot_ends_at);
