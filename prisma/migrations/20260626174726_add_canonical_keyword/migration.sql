-- AlterTable
ALTER TABLE "search_keyword_logs" ADD COLUMN     "canonical_keyword" VARCHAR(255) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "search_keyword_logs_canonical_keyword_idx" ON "search_keyword_logs"("canonical_keyword");

-- CreateIndex
CREATE INDEX "search_keyword_logs_canonical_keyword_created_at_idx" ON "search_keyword_logs"("canonical_keyword", "created_at");
