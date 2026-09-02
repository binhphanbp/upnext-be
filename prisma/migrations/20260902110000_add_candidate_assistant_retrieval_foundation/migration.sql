-- Candidate Assistant RAG foundation.
-- This migration must fail if pgvector is absent. A JSON fallback would make
-- retrieval silently non-production and would invalidate the release gate.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "AiKnowledgeAudience" AS ENUM ('candidate');
CREATE TYPE "AiKnowledgeSourceType" AS ENUM ('candidate_guide', 'upnext_policy');
CREATE TYPE "AiKnowledgeDocumentStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "ai_knowledge_documents" (
    "id" UUID NOT NULL,
    "audience" "AiKnowledgeAudience" NOT NULL DEFAULT 'candidate',
    "source_type" "AiKnowledgeSourceType" NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'vi',
    "title" VARCHAR(240) NOT NULL,
    "canonical_url" VARCHAR(500),
    "status" "AiKnowledgeDocumentStatus" NOT NULL DEFAULT 'draft',
    "source_version" VARCHAR(80) NOT NULL,
    "content_checksum" VARCHAR(128) NOT NULL,
    "effective_at" TIMESTAMP(3),
    "review_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_knowledge_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content_redacted" TEXT NOT NULL,
    "lexical_text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "content_checksum" VARCHAR(128) NOT NULL,
    "embedding_model" VARCHAR(120) NOT NULL,
    "index_version" VARCHAR(80) NOT NULL,
    "embedding_pgvector" vector(768),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "invalidated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_retrieval_runs" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "candidate_profile_id" UUID NOT NULL,
    "query_hash" VARCHAR(128) NOT NULL,
    "corpus" VARCHAR(60) NOT NULL,
    "filters_hash" VARCHAR(128) NOT NULL,
    "top_k" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_retrieval_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_retrieval_results" (
    "id" UUID NOT NULL,
    "retrieval_run_id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "semantic_score" DECIMAL(8,6) NOT NULL,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_retrieval_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_knowledge_documents_source_type_canonical_url_source_version_key"
  ON "ai_knowledge_documents"("source_type", "canonical_url", "source_version");
CREATE INDEX "ai_knowledge_documents_audience_status_locale_expires_at_idx"
  ON "ai_knowledge_documents"("audience", "status", "locale", "expires_at");
CREATE UNIQUE INDEX "ai_knowledge_chunks_document_id_ordinal_index_version_key"
  ON "ai_knowledge_chunks"("document_id", "ordinal", "index_version");
CREATE INDEX "ai_knowledge_chunks_document_id_is_valid_idx"
  ON "ai_knowledge_chunks"("document_id", "is_valid");
CREATE INDEX "ai_knowledge_chunks_lexical_idx"
  ON "ai_knowledge_chunks" USING GIN (to_tsvector('simple', "lexical_text"));
CREATE INDEX "ai_knowledge_chunks_embedding_hnsw_idx"
  ON "ai_knowledge_chunks" USING hnsw ("embedding_pgvector" vector_cosine_ops)
  WHERE "is_valid" = true AND "embedding_pgvector" IS NOT NULL;
CREATE INDEX "ai_retrieval_runs_candidate_profile_id_created_at_idx"
  ON "ai_retrieval_runs"("candidate_profile_id", "created_at");
CREATE INDEX "ai_retrieval_runs_conversation_id_created_at_idx"
  ON "ai_retrieval_runs"("conversation_id", "created_at");
CREATE UNIQUE INDEX "ai_retrieval_results_retrieval_run_id_chunk_id_key"
  ON "ai_retrieval_results"("retrieval_run_id", "chunk_id");
CREATE INDEX "ai_retrieval_results_chunk_id_idx" ON "ai_retrieval_results"("chunk_id");

ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "ai_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_retrieval_runs" ADD CONSTRAINT "ai_retrieval_runs_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_retrieval_runs" ADD CONSTRAINT "ai_retrieval_runs_candidate_profile_id_fkey"
  FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_retrieval_results" ADD CONSTRAINT "ai_retrieval_results_retrieval_run_id_fkey"
  FOREIGN KEY ("retrieval_run_id") REFERENCES "ai_retrieval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_retrieval_results" ADD CONSTRAINT "ai_retrieval_results_chunk_id_fkey"
  FOREIGN KEY ("chunk_id") REFERENCES "ai_knowledge_chunks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_non_negative_token_count"
  CHECK ("token_count" >= 0);
ALTER TABLE "ai_retrieval_runs" ADD CONSTRAINT "ai_retrieval_runs_non_negative_metrics"
  CHECK ("top_k" >= 0 AND "latency_ms" >= 0 AND "result_count" >= 0);
ALTER TABLE "ai_retrieval_results" ADD CONSTRAINT "ai_retrieval_results_positive_rank"
  CHECK ("rank" > 0);
