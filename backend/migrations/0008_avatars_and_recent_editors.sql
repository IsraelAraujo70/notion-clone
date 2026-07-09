-- Profile avatars + recent page editors for presence UI.

ALTER TABLE users ADD COLUMN avatar_key TEXT;

CREATE TABLE page_recent_editors (
    page_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (page_id, user_id)
);

CREATE INDEX page_recent_editors_page_edited_idx
    ON page_recent_editors (page_id, last_edited_at DESC);
