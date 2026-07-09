-- M3: versões por propriedade para last-writer-wins no apply.
ALTER TABLE blocks
    ADD COLUMN prop_versions JSONB NOT NULL DEFAULT '{}'::jsonb;
