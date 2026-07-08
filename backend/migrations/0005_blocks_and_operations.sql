-- M2: páginas deixam de ser estado local e viram blocos no Postgres.
-- Tudo é particionado por workspace_id (a história de sharding do README).

CREATE TABLE blocks (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (
        type IN (
            'page',
            'paragraph',
            'heading1',
            'heading2',
            'heading3',
            'bulleted_list_item',
            'numbered_list_item',
            'to_do',
            'toggle',
            'quote',
            'code',
            'callout',
            'divider'
        )
    ),
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Filhos vivos, na ordem. `content` manda na ordem; `parent_id` na pertinência.
    content UUID[] NOT NULL DEFAULT '{}'::uuid[],
    parent_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Soft delete só na raiz da subárvore; descendentes ficam intactos.
    trashed_at TIMESTAMPTZ,
    trashed_index INT
);

CREATE INDEX blocks_workspace_parent_live_idx
    ON blocks (workspace_id, parent_id)
    WHERE trashed_at IS NULL;

CREATE INDEX blocks_workspace_type_live_idx
    ON blocks (workspace_id, type)
    WHERE trashed_at IS NULL;

CREATE TABLE workspace_page_roots (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    root_page_id UUID NOT NULL UNIQUE REFERENCES blocks(id) ON DELETE CASCADE
);

-- Log de operações: base da idempotência (op_id) e do catch-up do M3 (seq).
ALTER TABLE workspaces ADD COLUMN operation_seq BIGINT NOT NULL DEFAULT 0;

CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    op_id UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation JSONB NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, op_id),
    UNIQUE (workspace_id, seq)
);

CREATE INDEX operations_workspace_seq_idx ON operations (workspace_id, seq);

-- Backfill: cada workspace existente ganha uma página raiz com um parágrafo em branco.
INSERT INTO blocks (id, workspace_id, type, properties, created_by)
SELECT gen_random_uuid(), w.id, 'page', '{"title": ""}'::jsonb, w.created_by
FROM workspaces w;

INSERT INTO workspace_page_roots (workspace_id, root_page_id)
SELECT workspace_id, id FROM blocks WHERE type = 'page' AND parent_id IS NULL;

WITH first_paragraph AS (
    INSERT INTO blocks (id, workspace_id, type, properties, parent_id, created_by)
    SELECT gen_random_uuid(), root.workspace_id, 'paragraph', '{"text": ""}'::jsonb, root.id, root.created_by
    FROM blocks root
    JOIN workspace_page_roots r ON r.root_page_id = root.id
    RETURNING id, parent_id
)
UPDATE blocks
SET content = ARRAY[first_paragraph.id]
FROM first_paragraph
WHERE blocks.id = first_paragraph.parent_id;
