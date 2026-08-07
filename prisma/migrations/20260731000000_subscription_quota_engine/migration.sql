-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('recruiter', 'candidate');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionFeature" ADD VALUE 'job_post';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'featured_job';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'urgent_label';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'cv_pool_view';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'ai_cv_matching';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'ai_jd_generate';
ALTER TYPE "SubscriptionFeature" ADD VALUE 'hr_seat';

-- AlterTable
ALTER TABLE "company_subscriptions" ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "current_period_start" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "audience" "PlanAudience" NOT NULL DEFAULT 'recruiter',
ADD COLUMN     "code" VARCHAR(60),
ADD COLUMN     "highlight_label" VARCHAR(60),
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit_value" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_quota_counters" (
    "id" UUID NOT NULL,
    "company_subscription_id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "limit_value" INTEGER,
    "used_value" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_quota_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "company_id" UUID,
    "actor_type" "ActorType",
    "actor_id" UUID,
    "model_name" VARCHAR(120) NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_estimate" DECIMAL(12,4),
    "reference_type" VARCHAR(80),
    "reference_id" UUID,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key" ON "plan_features"("plan_id", "feature");

-- CreateIndex
CREATE INDEX "subscription_quota_counters_company_subscription_id_feature_idx" ON "subscription_quota_counters"("company_subscription_id", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_quota_counters_company_subscription_id_feature_key" ON "subscription_quota_counters"("company_subscription_id", "feature", "period_start");

-- CreateIndex
CREATE INDEX "ai_usage_logs_company_id_feature_created_at_idx" ON "ai_usage_logs"("company_id", "feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_feature_created_at_idx" ON "ai_usage_logs"("feature", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE INDEX "subscription_plans_audience_is_public_status_idx" ON "subscription_plans"("audience", "is_public", "status");

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_quota_counters" ADD CONSTRAINT "subscription_quota_counters_company_subscription_id_fkey" FOREIGN KEY ("company_subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

