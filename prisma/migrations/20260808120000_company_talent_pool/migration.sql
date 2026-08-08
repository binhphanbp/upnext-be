-- Shortlists become a company-wide talent pool, and applications record how they started.
--
-- `recruiter_candidate_shortlists` is empty at the time of writing, so `company_id` is
-- backfilled from the owning recruiter and then made NOT NULL in one migration. The
-- backfill is still written out rather than assumed: a row whose recruiter has no company
-- cannot belong to a pool, so it is removed instead of blocking the constraint.

-- 1. How an application came to exist.
CREATE TYPE "ApplicationSource" AS ENUM ('candidate_applied', 'recruiter_invited');

ALTER TABLE "applications"
  ADD COLUMN "source" "ApplicationSource" NOT NULL DEFAULT 'candidate_applied';

-- 2. Attach shortlists to the company.
ALTER TABLE "recruiter_candidate_shortlists" ADD COLUMN "company_id" UUID;

UPDATE "recruiter_candidate_shortlists" s
   SET "company_id" = r."company_id"
  FROM "recruiter_accounts" r
 WHERE r."id" = s."recruiter_account_id"
   AND r."company_id" IS NOT NULL;

DELETE FROM "recruiter_candidate_shortlists" WHERE "company_id" IS NULL;

ALTER TABLE "recruiter_candidate_shortlists" ALTER COLUMN "company_id" SET NOT NULL;

ALTER TABLE "recruiter_candidate_shortlists"
  ADD CONSTRAINT "recruiter_candidate_shortlists_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. One entry per candidate per company.
--
-- The old key included the nullable `job_post_id`, which never actually prevented
-- duplicates: Postgres treats each NULL as distinct, so the same candidate could be saved
-- into the general pool any number of times. Keeping the strictest possible ordering here
-- (dedupe, drop, create) means the new constraint cannot fail on existing data.
DELETE FROM "recruiter_candidate_shortlists"
 WHERE "id" NOT IN (
   SELECT DISTINCT ON ("company_id", "candidate_profile_id") "id"
     FROM "recruiter_candidate_shortlists"
    ORDER BY "company_id", "candidate_profile_id", "priority" DESC, "created_at" ASC
 );

DROP INDEX IF EXISTS "recruiter_candidate_shortlists_candidate_profile_id_recruiter_a_key";

ALTER TABLE "recruiter_candidate_shortlists"
  DROP CONSTRAINT IF EXISTS "recruiter_candidate_shortlists_candidate_profile_id_recruiter_a_key";

CREATE UNIQUE INDEX "recruiter_candidate_shortlists_company_id_candidate_profile_id_key"
  ON "recruiter_candidate_shortlists" ("company_id", "candidate_profile_id");

CREATE INDEX "recruiter_candidate_shortlists_company_id_status_created_at_idx"
  ON "recruiter_candidate_shortlists" ("company_id", "status", "created_at");
