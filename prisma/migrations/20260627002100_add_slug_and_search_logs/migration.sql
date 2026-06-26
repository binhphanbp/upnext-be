-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "slug" VARCHAR(200) NOT NULL;

-- CreateTable
CREATE TABLE "search_keyword_logs" (
    "id" BIGSERIAL NOT NULL,
    "keyword" VARCHAR(255) NOT NULL,
    "normalized_keyword" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(191),
    "session_id" VARCHAR(255),
    "ip_address" VARCHAR(64),
    "source" VARCHAR(50),
    "result_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_keyword_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_keyword_logs_normalized_keyword_idx" ON "search_keyword_logs"("normalized_keyword");

-- CreateIndex
CREATE INDEX "search_keyword_logs_created_at_idx" ON "search_keyword_logs"("created_at");

-- CreateIndex
CREATE INDEX "search_keyword_logs_normalized_keyword_created_at_idx" ON "search_keyword_logs"("normalized_keyword", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
