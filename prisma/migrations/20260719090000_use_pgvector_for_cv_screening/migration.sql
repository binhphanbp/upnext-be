-- Store and rank CV embeddings with pgvector if available on PostgreSQL server.
-- Fallback gracefully to JSONB embeddings if pgvector extension is missing.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS vector;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'job_embeddings' AND column_name = 'embedding_pgvector'
        ) THEN
            ALTER TABLE "job_embeddings" ADD COLUMN "embedding_pgvector" vector(768);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'cv_embeddings' AND column_name = 'embedding_pgvector'
        ) THEN
            ALTER TABLE "cv_embeddings" ADD COLUMN "embedding_pgvector" vector(768);
        END IF;

        UPDATE "job_embeddings"
        SET "embedding_pgvector" = "embedding_vector"::text::vector
        WHERE jsonb_typeof("embedding_vector") = 'array'
          AND jsonb_array_length("embedding_vector") = 768;

        UPDATE "cv_embeddings"
        SET "embedding_pgvector" = "embedding_vector"::text::vector
        WHERE jsonb_typeof("embedding_vector") = 'array'
          AND jsonb_array_length("embedding_vector") = 768;

        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'job_embeddings_embedding_pgvector_hnsw_idx'
        ) THEN
            CREATE INDEX "job_embeddings_embedding_pgvector_hnsw_idx"
            ON "job_embeddings"
            USING hnsw ("embedding_pgvector" vector_cosine_ops)
            WHERE "embedding_pgvector" IS NOT NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'cv_embeddings_embedding_pgvector_hnsw_idx'
        ) THEN
            CREATE INDEX "cv_embeddings_embedding_pgvector_hnsw_idx"
            ON "cv_embeddings"
            USING hnsw ("embedding_pgvector" vector_cosine_ops)
            WHERE "embedding_pgvector" IS NOT NULL;
        END IF;
    END IF;
END $$;
