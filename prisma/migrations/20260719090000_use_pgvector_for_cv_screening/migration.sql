-- Store and rank CV embeddings with pgvector. The JSONB columns are retained
-- temporarily for backwards compatibility with workers deployed before this migration.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "job_embeddings"
ADD COLUMN "embedding_pgvector" vector(768);

ALTER TABLE "cv_embeddings"
ADD COLUMN "embedding_pgvector" vector(768);

-- Existing embeddings were validated as 768 finite numbers before being saved.
UPDATE "job_embeddings"
SET "embedding_pgvector" = "embedding_vector"::text::vector
WHERE jsonb_typeof("embedding_vector") = 'array'
  AND jsonb_array_length("embedding_vector") = 768;

UPDATE "cv_embeddings"
SET "embedding_pgvector" = "embedding_vector"::text::vector
WHERE jsonb_typeof("embedding_vector") = 'array'
  AND jsonb_array_length("embedding_vector") = 768;

CREATE INDEX "job_embeddings_embedding_pgvector_hnsw_idx"
ON "job_embeddings"
USING hnsw ("embedding_pgvector" vector_cosine_ops)
WHERE "embedding_pgvector" IS NOT NULL;

CREATE INDEX "cv_embeddings_embedding_pgvector_hnsw_idx"
ON "cv_embeddings"
USING hnsw ("embedding_pgvector" vector_cosine_ops)
WHERE "embedding_pgvector" IS NOT NULL;
