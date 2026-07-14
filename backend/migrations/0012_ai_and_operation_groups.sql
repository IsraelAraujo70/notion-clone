CREATE TABLE operation_groups (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('human', 'ai')),
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);

ALTER TABLE operations
    ADD COLUMN group_id UUID,
    ADD COLUMN group_ordinal INT;

ALTER TABLE operations
    ADD CONSTRAINT operations_group_fk
    FOREIGN KEY (workspace_id, group_id)
    REFERENCES operation_groups(workspace_id, id);

ALTER TABLE operations
    ADD CONSTRAINT operations_group_ordinal_check
    CHECK (
        (group_id IS NULL) = (group_ordinal IS NULL)
        AND (group_ordinal IS NULL OR group_ordinal >= 0)
    );

CREATE UNIQUE INDEX operations_workspace_group_ordinal_key
    ON operations(workspace_id, group_id, group_ordinal) WHERE group_id IS NOT NULL;

CREATE INDEX operations_workspace_group_idx
    ON operations(workspace_id, group_id) WHERE group_id IS NOT NULL;

CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id)
);
CREATE INDEX ai_conversations_private_idx
    ON ai_conversations(workspace_id, user_id, updated_at DESC);

CREATE TABLE ai_messages (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ai_conversations(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX ai_messages_private_idx
    ON ai_messages(workspace_id, conversation_id, user_id, created_at);

CREATE TABLE ai_runs (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    conversation_id UUID,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    model TEXT NOT NULL,
    operation_group_id UUID,
    error TEXT,
    last_seq BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CHECK (
        (status IN ('queued', 'running') AND completed_at IS NULL)
        OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
    ),
    CHECK ((status = 'failed') = (error IS NOT NULL)),
    FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ai_conversations(workspace_id, id),
    FOREIGN KEY (workspace_id, operation_group_id)
        REFERENCES operation_groups(workspace_id, id),
    UNIQUE (workspace_id, id)
);
CREATE INDEX ai_runs_private_idx ON ai_runs(workspace_id, user_id, created_at DESC);
CREATE INDEX ai_runs_stale_running_idx ON ai_runs(deadline_at) WHERE status = 'running';

CREATE TABLE ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens BIGINT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, run_id)
        REFERENCES ai_runs(workspace_id, id) ON DELETE CASCADE
);
