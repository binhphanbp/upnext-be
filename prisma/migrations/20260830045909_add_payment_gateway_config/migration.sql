/*
  Warnings:

  - You are about to drop the column `embedding_pgvector` on the `cv_embeddings` table. All the data in the column will be lost.
  - You are about to drop the column `embedding_pgvector` on the `job_embeddings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "applications_offer_deadline_at_idx";

-- DropIndex
DROP INDEX "reports_reporter_recruiter_account_id_idx";

-- AlterTable
ALTER TABLE "cv_embeddings" DROP COLUMN "embedding_pgvector";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "payment_reference" VARCHAR(120);

-- AlterTable
ALTER TABLE "job_embeddings" DROP COLUMN "embedding_pgvector";

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" UUID NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" VARCHAR(120),
    "bank_bin" VARCHAR(20),
    "account_number" VARCHAR(50),
    "account_name" VARCHAR(150),
    "webhook_api_key" VARCHAR(255),
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_provider_key" ON "payment_gateway_configs"("provider");

-- RenameForeignKey
ALTER TABLE "candidate_subscription_quota_counters" RENAME CONSTRAINT "candidate_subscription_quota_counters_candidate_subscription_id" TO "candidate_subscription_quota_counters_candidate_subscripti_fkey";

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_conversations_candidate_profile_id_is_archived_updated_at_id" RENAME TO "ai_conversations_candidate_profile_id_is_archived_updated_a_idx";

-- RenameIndex
ALTER INDEX "applications_job_post_submitted_at_idx" RENAME TO "applications_job_post_id_submitted_at_idx";

-- RenameIndex
ALTER INDEX "job_posts_public_home_idx" RENAME TO "job_posts_status_moderation_status_published_at_expired_at_idx";

-- RenameIndex
ALTER INDEX "saved_jobs_job_post_created_at_idx" RENAME TO "saved_jobs_job_post_id_created_at_idx";
