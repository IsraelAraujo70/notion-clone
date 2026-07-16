CREATE TABLE integration_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    scopes TEXT[] NOT NULL CHECK (
        cardinality(scopes) > 0
        AND scopes <@ ARRAY['content:read', 'content:write', 'search:read', 'media:read']::TEXT[]
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX integration_tokens_user_created_idx
    ON integration_tokens(user_id, created_at DESC);

CREATE TABLE integration_token_workspaces (
    token_id UUID NOT NULL REFERENCES integration_tokens(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (token_id, workspace_id)
);

CREATE INDEX integration_token_workspaces_workspace_idx
    ON integration_token_workspaces(workspace_id, token_id);

ALTER TABLE operation_groups DROP CONSTRAINT operation_groups_source_check;
ALTER TABLE operation_groups ADD CONSTRAINT operation_groups_source_check
    CHECK (source IN ('human', 'ai', 'mcp'));
