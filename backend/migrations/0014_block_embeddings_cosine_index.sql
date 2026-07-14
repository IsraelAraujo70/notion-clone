-- no-transaction
-- halfvec keeps the default 3,072 dimensions indexable by pgvector HNSW.
CREATE INDEX CONCURRENTLY block_embeddings_cosine_idx
    ON block_embeddings USING hnsw (embedding halfvec_cosine_ops);
