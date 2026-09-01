-- CreateEnum
CREATE TYPE "JobBoostEndedReason" AS ENUM ('expired', 'recruiter_stopped', 'job_closed', 'job_expired', 'job_hidden', 'moderation_rejected', 'admin_cancelled');

-- CreateEnum
CREATE TYPE "JobBoostPlacement" AS ENUM ('search', 'homepage');

-- CreateEnum
CREATE TYPE "JobBoostEventType" AS ENUM ('impression', 'click');

-- AlterTable
ALTER TABLE "job_boost" ADD COLUMN     "ended_reason" "JobBoostEndedReason",
ADD COLUMN     "first_impression_at" TIMESTAMP(3),
ADD COLUMN     "idempotency_key" VARCHAR(200),
ADD COLUMN     "last_impression_at" TIMESTAMP(3),
ADD COLUMN     "last_served_at" TIMESTAMP(3),
ADD COLUMN     "placement_version" VARCHAR(20) NOT NULL DEFAULT 'v1';

-- Backfill any pre-existing rows (this feature already had ad-hoc use before
-- this rollout) with a synthetic, unique key before enforcing NOT NULL --
-- avoids the constraint failing on a non-empty table in any environment.
UPDATE "job_boost" SET "idempotency_key" = 'legacy:' || id::text WHERE "idempotency_key" IS NULL;

ALTER TABLE "job_boost" ALTER COLUMN "idempotency_key" SET NOT NULL;

-- CreateTable
CREATE TABLE "job_boost_delivery_events" (
    "id" UUID NOT NULL,
    "job_boost_id" UUID NOT NULL,
    "placement" "JobBoostPlacement" NOT NULL,
    "event_type" "JobBoostEventType" NOT NULL,
    "visitor_hash" VARCHAR(64) NOT NULL,
    "event_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_boost_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_boost_delivery_events_job_boost_id_event_date_idx" ON "job_boost_delivery_events"("job_boost_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "job_boost_delivery_events_job_boost_id_placement_event_type_key" ON "job_boost_delivery_events"("job_boost_id", "placement", "event_type", "visitor_hash", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "job_boost_idempotency_key_key" ON "job_boost"("idempotency_key");

-- CreateIndex
CREATE INDEX "job_boost_status_last_served_at_idx" ON "job_boost"("status", "last_served_at");

-- AddForeignKey
ALTER TABLE "job_boost_delivery_events" ADD CONSTRAINT "job_boost_delivery_events_job_boost_id_fkey" FOREIGN KEY ("job_boost_id") REFERENCES "job_boost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: at most one SCHEDULED or ACTIVE boost per job post.
-- Not expressible in schema.prisma's DSL (no partial/WHERE unique indexes) --
-- mirrors the hand-written pattern in
-- 20260819130000_one_active_subscription_per_owner. This is the real,
-- DB-enforced guard against two concurrent "boost this job" requests both
-- succeeding; the application-level pre-check in JobBoostService is only a
-- fast-path UX check, not the source of truth.
CREATE UNIQUE INDEX "job_boost_one_live_per_job" ON "job_boost"("job_post_id") WHERE "status" IN ('scheduled', 'active');
