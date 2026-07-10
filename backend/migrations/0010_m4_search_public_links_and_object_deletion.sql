-- M4: full-text search, public read-only pages, and durable media deletion.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE blocks
    ADD COLUMN search_document TSVECTOR GENERATED ALWAYS AS (
        setweight(
            to_tsvector('simple'::regconfig, COALESCE(properties ->> 'title', '')),
            'A'
        ) ||
        setweight(
            to_tsvector(
                'simple'::regconfig,
                COALESCE(properties ->> 'text', '') || ' ' ||
                COALESCE(properties ->> 'caption', '')
            ),
            'B'
        )
    ) STORED;

CREATE TABLE public_page_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CHECK (revoked_at IS NOT NULL OR revoked_by IS NULL)
);

CREATE UNIQUE INDEX public_page_links_one_active_per_page_idx
    ON public_page_links (page_id)
    WHERE revoked_at IS NULL;

CREATE INDEX public_page_links_workspace_active_idx
    ON public_page_links (workspace_id, page_id)
    WHERE revoked_at IS NULL;

CREATE TABLE object_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_key TEXT NOT NULL UNIQUE CHECK (length(object_key) > 0),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX object_deletion_jobs_pending_idx
    ON object_deletion_jobs (available_at, created_at)
    WHERE completed_at IS NULL;
