-- Cột vector cho Discovery index, theo đúng khuôn migration
-- 20260719090000_use_pgvector_for_cv_screening: bọc trong guard
-- `pg_available_extensions` vì staging từng thiếu extension `vector`.
--
-- ⚠️ Cột `embedding_pgvector` **cố ý vô hình với Prisma**: `schema.prisma` không
-- có kiểu `vector`, nên khai nó ở đó sẽ khiến `prisma migrate dev` sinh lệnh DROP
-- ở lần diff kế tiếp. Truy cập duy nhất là qua `$queryRaw`. Cùng lý do và cùng
-- cách làm như `cv_embeddings.embedding_pgvector`.
--
-- Index là **partial** trên `status = 'active'`: một dòng INACTIVE (consent bị
-- rút) hay FAILED không được nằm trong không gian tìm kiếm, và loại chúng ở
-- tầng index rẻ hơn loại ở tầng predicate.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'talent_discovery_indexes' AND column_name = 'embedding_pgvector'
        ) THEN
            ALTER TABLE "talent_discovery_indexes" ADD COLUMN "embedding_pgvector" vector(768);
        END IF;

        -- Backfill từ JSONB cho các dòng đã index trước migration này.
        UPDATE "talent_discovery_indexes"
        SET "embedding_pgvector" = "embedding_vector"::text::vector
        WHERE "embedding_pgvector" IS NULL
          AND jsonb_typeof("embedding_vector") = 'array'
          AND jsonb_array_length("embedding_vector") = 768;

        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'talent_discovery_indexes_pgvector_hnsw_idx'
        ) THEN
            CREATE INDEX "talent_discovery_indexes_pgvector_hnsw_idx"
            ON "talent_discovery_indexes"
            USING hnsw ("embedding_pgvector" vector_cosine_ops)
            WHERE "embedding_pgvector" IS NOT NULL AND "status" = 'active';
        END IF;
    END IF;
END $$;
