-- Enable pgvector for indexed semantic retrieval.
CREATE EXTENSION IF NOT EXISTS vector;

-- Keep the JSON columns during the rollout so existing Prisma reads remain
-- backwards-compatible. New 768-dimensional normalized embeddings are also
-- stored in these pgvector columns and used for nearest-neighbour search.
ALTER TABLE "job_embeddings"
ADD COLUMN "search_vector" vector(768);

ALTER TABLE "cv_embeddings"
ADD COLUMN "search_vector" vector(768);

ALTER TABLE "job_embeddings"
ALTER COLUMN "model_name" SET DEFAULT 'gemini-embedding-001:768:l2-v1';

ALTER TABLE "cv_embeddings"
ALTER COLUMN "model_name" SET DEFAULT 'gemini-embedding-001:768:l2-v1';

-- HNSW gives a strong speed/recall trade-off and does not need a training pass.
CREATE INDEX "job_embeddings_search_vector_hnsw_idx"
ON "job_embeddings"
USING hnsw ("search_vector" vector_cosine_ops)
WITH (m = 16, ef_construction = 96);

CREATE INDEX "cv_embeddings_search_vector_hnsw_idx"
ON "cv_embeddings"
USING hnsw ("search_vector" vector_cosine_ops)
WITH (m = 16, ef_construction = 96);

-- Preserve the pure semantic score while exposing the deterministic skill
-- signal and the hybrid retrieval score used to shortlist candidates.
ALTER TABLE "application_ai_scores"
ADD COLUMN "skill_match_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "retrieval_score" DECIMAL(5,2) NOT NULL DEFAULT 0;
