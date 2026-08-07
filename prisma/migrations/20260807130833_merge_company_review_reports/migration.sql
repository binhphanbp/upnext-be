-- Merge company review reports into the generic `reports` table so admins have a
-- single moderation queue that can be filtered by who filed the report.

-- 1) Recruiters can now be reporters. SetNull matches how reporter_candidate_id
--    behaves, so moderation history survives an account being deleted.
ALTER TABLE "reports" ADD COLUMN "reporter_recruiter_account_id" UUID;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_reporter_recruiter_account_id_fkey"
  FOREIGN KEY ("reporter_recruiter_account_id") REFERENCES "recruiter_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reports_reporter_recruiter_account_id_idx"
  ON "reports"("reporter_recruiter_account_id");

-- 2) Added nullable so existing rows can be backfilled before the NOT NULL.
ALTER TABLE "reports" ADD COLUMN "reporter_type" "ActorType";

-- 3) Everything that exists today was filed by a candidate.
UPDATE "reports" SET "reporter_type" = 'candidate' WHERE "reporter_type" IS NULL;

-- 4) Move recruiter-filed review reports across, keeping their ids and history so
--    any admin already looking at one does not lose it.
INSERT INTO "reports" (
  "id", "reporter_type", "reporter_recruiter_account_id", "handled_by_admin_id",
  "target_type", "target_id", "reason", "status", "created_at", "updated_at"
)
SELECT
  "id", 'recruiter', "reporter_recruiter_account_id", "handled_by_admin_id",
  'COMPANY_REVIEW', "company_review_id", "reason", "status", "created_at", "updated_at"
FROM "company_review_reports";

ALTER TABLE "reports" ALTER COLUMN "reporter_type" SET NOT NULL;

CREATE INDEX "reports_reporter_type_idx" ON "reports"("reporter_type");

-- 5) One report per recruiter per target. Postgres treats NULLs as distinct, so
--    candidate-filed reports (NULL recruiter) stay unconstrained, as before.
CREATE UNIQUE INDEX "reports_target_type_target_id_reporter_recruiter_account_id_key"
  ON "reports"("target_type", "target_id", "reporter_recruiter_account_id");

-- 6) Superseded by the rows inserted above.
DROP TABLE "company_review_reports";
