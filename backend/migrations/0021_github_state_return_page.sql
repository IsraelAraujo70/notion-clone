-- OAuth states are ephemeral, so discard any in-flight setup before requiring
-- a validated internal return page for new installation flows.
DELETE FROM github_installation_states;

ALTER TABLE github_installation_states
    ADD COLUMN return_page_id UUID NOT NULL;

ALTER TABLE github_installation_states
    ADD CONSTRAINT github_installation_states_return_page_fk
    FOREIGN KEY (return_page_id, workspace_id)
    REFERENCES blocks(id, workspace_id) ON DELETE CASCADE;
