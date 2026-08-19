-- An owner can hold historical subscriptions, but entitlement resolution must
-- never have to choose between two simultaneously ACTIVE records.  Keep the
-- most recently started record if legacy/seed data contains duplicates, then
-- make that business invariant database-enforced.

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "company_id"
      ORDER BY "started_at" DESC, "created_at" DESC, "id" DESC
    ) AS rank
  FROM "company_subscriptions"
  WHERE "status" = 'active'
)
UPDATE "company_subscriptions" AS subscription
SET "status" = 'inactive'
FROM ranked
WHERE subscription."id" = ranked."id"
  AND ranked.rank > 1;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "candidate_profile_id"
      ORDER BY "started_at" DESC, "created_at" DESC, "id" DESC
    ) AS rank
  FROM "candidate_subscriptions"
  WHERE "status" = 'active'
)
UPDATE "candidate_subscriptions" AS subscription
SET "status" = 'inactive'
FROM ranked
WHERE subscription."id" = ranked."id"
  AND ranked.rank > 1;

CREATE UNIQUE INDEX "company_subscriptions_one_active_per_company_uq"
  ON "company_subscriptions"("company_id")
  WHERE "status" = 'active';

CREATE UNIQUE INDEX "candidate_subscriptions_one_active_per_profile_uq"
  ON "candidate_subscriptions"("candidate_profile_id")
  WHERE "status" = 'active';
