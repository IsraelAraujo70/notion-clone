CREATE TABLE github_installation_states (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) = 64),
    kind TEXT NOT NULL CHECK (kind IN ('setup', 'oauth')),
    installation_id BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (
        (kind = 'setup' AND installation_id IS NULL)
        OR (kind = 'oauth' AND installation_id > 0)
    )
);

CREATE INDEX github_installation_states_workspace_idx
    ON github_installation_states(workspace_id, created_at DESC);

CREATE TABLE github_installations (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    installation_id BIGINT NOT NULL UNIQUE CHECK (installation_id > 0),
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL,
    installed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (id, workspace_id)
);

CREATE TABLE github_pr_links (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    block_id UUID NOT NULL,
    github_installation_id UUID NOT NULL,
    owner TEXT NOT NULL,
    repository TEXT NOT NULL,
    pull_number BIGINT NOT NULL CHECK (pull_number > 0),
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    state TEXT NOT NULL,
    draft BOOLEAN NOT NULL,
    author_login TEXT,
    head_sha TEXT NOT NULL,
    base_ref TEXT NOT NULL,
    head_ref TEXT NOT NULL,
    additions BIGINT NOT NULL CHECK (additions >= 0),
    deletions BIGINT NOT NULL CHECK (deletions >= 0),
    changed_files BIGINT NOT NULL CHECK (changed_files >= 0),
    linked_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (workspace_id, block_id),
    FOREIGN KEY (block_id, workspace_id)
        REFERENCES blocks(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (github_installation_id, workspace_id)
        REFERENCES github_installations(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX github_pr_links_workspace_updated_idx
    ON github_pr_links(workspace_id, updated_at DESC);
