-- Subscription lifecycle foundation: immutable checkout evidence plus a
-- cancellable-at-period-end entitlement state.  No payment-provider tables are
-- introduced here; SANDBOX is deliberately a separate controlled flow.

CREATE TYPE "SubscriptionCheckoutStatus" AS ENUM ('pending', 'completed', 'cancelled');

ALTER TABLE "company_subscriptions"
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3),
  ADD COLUMN "source" VARCHAR(50) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "plan_snapshot" JSONB;

ALTER TABLE "candidate_subscriptions"
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3),
  ADD COLUMN "source" VARCHAR(50) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "plan_snapshot" JSONB;

CREATE TABLE "subscription_checkouts" (
  "id" UUID NOT NULL,
  "audience" "PlanAudience" NOT NULL,
  "owner_id" UUID NOT NULL,
  "subscription_plan_id" UUID NOT NULL,
  "plan_snapshot" JSONB NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
  "status" "SubscriptionCheckoutStatus" NOT NULL DEFAULT 'pending',
  "provider" VARCHAR(50) NOT NULL DEFAULT 'SANDBOX',
  "idempotency_key" VARCHAR(180) NOT NULL,
  "actor_type" "ActorType",
  "actor_id" UUID,
  "subscription_id" UUID,
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_lifecycle_events" (
  "id" UUID NOT NULL,
  "audience" "PlanAudience" NOT NULL,
  "owner_id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "subscription_plan_id" UUID,
  "checkout_id" UUID,
  "actor_type" "ActorType",
  "actor_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_checkouts_audience_owner_id_idempotency_key_key"
  ON "subscription_checkouts"("audience", "owner_id", "idempotency_key");
CREATE INDEX "subscription_checkouts_audience_owner_id_status_idx"
  ON "subscription_checkouts"("audience", "owner_id", "status");
CREATE INDEX "subscription_checkouts_subscription_plan_id_idx"
  ON "subscription_checkouts"("subscription_plan_id");
CREATE INDEX "subscription_checkouts_audience_owner_id_subscription_id_idx"
  ON "subscription_checkouts"("audience", "owner_id", "subscription_id");
CREATE INDEX "subscription_lifecycle_events_audience_owner_id_created_at_idx"
  ON "subscription_lifecycle_events"("audience", "owner_id", "created_at");
CREATE INDEX "subscription_lifecycle_events_checkout_id_idx"
  ON "subscription_lifecycle_events"("checkout_id");

ALTER TABLE "subscription_checkouts"
  ADD CONSTRAINT "subscription_checkouts_subscription_plan_id_fkey"
  FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
