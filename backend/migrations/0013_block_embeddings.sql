-- M5: durable, coalescing block embedding pipeline.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE blocks
    ADD CONSTRAINT blocks_id_workspace_unique UNIQUE (id, workspace_id);

CREATE TABLE block_embeddings (
    workspace_id UUID NOT NULL,
    block_id UUID NOT NULL,
    model TEXT NOT NULL CHECK (length(model) > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    -- halfvec supports HNSW indexes up to 4,000 dimensions; vector supports 2,000.
    embedding HALFVEC(3072) NOT NULL,
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, block_id),
    FOREIGN KEY (block_id, workspace_id)
        REFERENCES blocks (id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE block_embedding_jobs (
    workspace_id UUID NOT NULL,
    block_id UUID NOT NULL,
    model TEXT NOT NULL CHECK (length(model) > 0),
    dimensions INTEGER NOT NULL CHECK (dimensions = 3072),
    content TEXT NOT NULL CHECK (length(content) > 0),
    content_hash BYTEA NOT NULL CHECK (octet_length(content_hash) = 32),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_token UUID,
    leased_until TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, block_id),
    FOREIGN KEY (block_id, workspace_id)
        REFERENCES blocks (id, workspace_id) ON DELETE CASCADE,
    CHECK ((lease_token IS NULL) = (leased_until IS NULL))
);

CREATE INDEX block_embedding_jobs_pending_idx
    ON block_embedding_jobs (available_at, created_at)
    WHERE lease_token IS NULL;

CREATE INDEX block_embedding_jobs_expired_lease_idx
    ON block_embedding_jobs (leased_until, available_at)
    WHERE lease_token IS NOT NULL;

-- Existing live content enters the same durable queue used by future operations.
WITH RECURSIVE canonical AS (
    SELECT b.id,
           b.workspace_id,
           b.parent_id,
           concat_ws(
               E'\n',
               NULLIF(btrim(COALESCE(b.properties ->> 'title', '')), ''),
               NULLIF(btrim(COALESCE(b.properties ->> 'text', '')), ''),
               NULLIF(btrim(COALESCE(b.properties ->> 'caption', '')), '')
           ) AS content
    FROM blocks b
    WHERE b.type <> 'divider' AND b.trashed_at IS NULL
), ancestors AS (
    SELECT c.id AS candidate_id, c.workspace_id, c.parent_id, false AS trashed
    FROM canonical c
    UNION ALL
    SELECT a.candidate_id, a.workspace_id, p.parent_id, p.trashed_at IS NOT NULL
    FROM ancestors a
    JOIN blocks p ON p.id = a.parent_id AND p.workspace_id = a.workspace_id
), eligible AS (
    SELECT c.*
    FROM canonical c
    WHERE length(c.content) > 0
      AND NOT EXISTS (
          SELECT 1 FROM ancestors a
          WHERE a.candidate_id = c.id AND a.trashed
      )
)
INSERT INTO block_embedding_jobs
    (workspace_id, block_id, model, dimensions, content, content_hash)
SELECT workspace_id,
       id,
       'openai/text-embedding-3-large',
       3072,
       content,
       digest(
           convert_to('openai/text-embedding-3-large', 'UTF8') ||
           decode('00', 'hex') ||
           convert_to(content, 'UTF8'),
           'sha256'
       )
FROM eligible;
