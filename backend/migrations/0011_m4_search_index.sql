-- no-transaction
-- blocks is live in production, so this index must not take a table-wide write lock.
CREATE INDEX CONCURRENTLY blocks_search_document_live_idx
    ON blocks USING GIN (search_document)
    WHERE trashed_at IS NULL;
