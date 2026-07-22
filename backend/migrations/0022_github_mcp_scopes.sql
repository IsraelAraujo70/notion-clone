ALTER TABLE integration_tokens
    DROP CONSTRAINT integration_tokens_scopes_check;

ALTER TABLE integration_tokens
    ADD CONSTRAINT integration_tokens_scopes_check CHECK (
        cardinality(scopes) > 0
        AND scopes <@ ARRAY[
            'content:read',
            'content:write',
            'search:read',
            'media:read',
            'github:read',
            'github:write'
        ]::TEXT[]
    );
