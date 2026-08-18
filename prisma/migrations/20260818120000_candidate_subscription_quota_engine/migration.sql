-- Candidate subscriptions deliberately reuse the plan catalogue and feature
-- enum. Owner-specific rows and ledgers keep entitlement/billing boundaries
-- explicit between candidates and recruiters.

-- AlterEnum
ALTER TYPE "SubscriptionFeature" ADD VALUE 'ai_copilot_run';

-- CreateTable
CREATE TABLE "candidate_subscriptions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_subscription_quota_counters" (
    "id" UUID NOT NULL,
    "candidate_subscription_id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "limit_value" INTEGER,
    "used_value" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_subscription_quota_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_subscription_usages" (
    "id" UUID NOT NULL,
    "candidate_subscription_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "feature" "SubscriptionFeature" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "direction" "SubscriptionUsageDirection" NOT NULL,
    "reference_type" VARCHAR(80) NOT NULL,
    "reference_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(180) NOT NULL,
    "reversed_usage_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_subscription_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_subscriptions_candidate_profile_id_status_idx"
  ON "candidate_subscriptions"("candidate_profile_id", "status");
CREATE INDEX "candidate_subscriptions_expired_at_idx"
  ON "candidate_subscriptions"("expired_at");
CREATE INDEX "candidate_subscription_quota_counters_candidate_subscription_id_feature_idx"
  ON "candidate_subscription_quota_counters"("candidate_subscription_id", "feature");
CREATE UNIQUE INDEX "candidate_subscription_quota_counters_candidate_subscription_id_feature_period_start_key"
  ON "candidate_subscription_quota_counters"("candidate_subscription_id", "feature", "period_start");
CREATE UNIQUE INDEX "candidate_subscription_usages_idempotency_key_key"
  ON "candidate_subscription_usages"("idempotency_key");
CREATE UNIQUE INDEX "candidate_subscription_usages_reversed_usage_id_key"
  ON "candidate_subscription_usages"("reversed_usage_id");
CREATE INDEX "candidate_subscription_usages_candidate_profile_id_feature_created_at_idx"
  ON "candidate_subscription_usages"("candidate_profile_id", "feature", "created_at");
CREATE INDEX "candidate_subscription_usages_candidate_subscription_id_feature_created_at_idx"
  ON "candidate_subscription_usages"("candidate_subscription_id", "feature", "created_at");

-- AddForeignKey
ALTER TABLE "candidate_subscriptions"
  ADD CONSTRAINT "candidate_subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_subscriptions"
  ADD CONSTRAINT "candidate_subscriptions_candidate_profile_id_fkey"
  FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_subscription_quota_counters"
  ADD CONSTRAINT "candidate_subscription_quota_counters_candidate_subscription_id_fkey"
  FOREIGN KEY ("candidate_subscription_id") REFERENCES "candidate_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_subscription_usages"
  ADD CONSTRAINT "candidate_subscription_usages_candidate_subscription_id_fkey"
  FOREIGN KEY ("candidate_subscription_id") REFERENCES "candidate_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_subscription_usages"
  ADD CONSTRAINT "candidate_subscription_usages_candidate_profile_id_fkey"
  FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_subscription_usages"
  ADD CONSTRAINT "candidate_subscription_usages_reversed_usage_id_fkey"
  FOREIGN KEY ("reversed_usage_id") REFERENCES "candidate_subscription_usages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
