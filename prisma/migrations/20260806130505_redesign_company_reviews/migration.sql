-- Redesign company reviews: key reviews by (candidate_profile_id, company_id)
-- instead of applicationId, and add a dedicated review-report table for
-- companies to flag reviews for admin moderation.

-- 1) Add the new column (nullable for now so we can backfill).
ALTER TABLE "company_reviews" ADD COLUMN "candidate_profile_id" UUID;

-- 2) Backfill from the application this review used to be tied to.
UPDATE "company_reviews" cr
SET "candidate_profile_id" = a."candidate_profile_id"
FROM "applications" a
WHERE a."id" = cr."application_id";

-- 3) Enforce NOT NULL now that every row has a value.
ALTER TABLE "company_reviews" ALTER COLUMN "candidate_profile_id" SET NOT NULL;

-- 4) Drop the old application_id column (and its FK/unique constraint with it).
ALTER TABLE "company_reviews" DROP COLUMN "application_id";

-- 5) New FK to candidate_profiles.
ALTER TABLE "company_reviews"
  ADD CONSTRAINT "company_reviews_candidate_profile_id_fkey"
  FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) One review per candidate per company.
ALTER TABLE "company_reviews"
  ADD CONSTRAINT "company_reviews_candidate_profile_id_company_id_key"
  UNIQUE ("candidate_profile_id", "company_id");

-- 7) Reviews go live immediately now (no admin pre-approval step).
ALTER TABLE "company_reviews" ALTER COLUMN "status" SET DEFAULT 'approved';

-- 8) New table: a recruiter/company flags a review as fake/abusive.
CREATE TABLE "company_review_reports" (
    "id" UUID NOT NULL,
    "company_review_id" UUID NOT NULL,
    "reporter_recruiter_account_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "handled_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_review_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_review_reports_company_review_id_reporter_recruite_key"
  ON "company_review_reports"("company_review_id", "reporter_recruiter_account_id");

CREATE INDEX "company_review_reports_status_idx" ON "company_review_reports"("status");

ALTER TABLE "company_review_reports"
  ADD CONSTRAINT "company_review_reports_company_review_id_fkey"
  FOREIGN KEY ("company_review_id") REFERENCES "company_reviews"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_review_reports"
  ADD CONSTRAINT "company_review_reports_reporter_recruiter_account_id_fkey"
  FOREIGN KEY ("reporter_recruiter_account_id") REFERENCES "recruiter_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_review_reports"
  ADD CONSTRAINT "company_review_reports_handled_by_admin_id_fkey"
  FOREIGN KEY ("handled_by_admin_id") REFERENCES "admin"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
