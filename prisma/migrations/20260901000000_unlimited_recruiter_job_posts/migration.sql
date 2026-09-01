-- Job posts are the marketplace's supply, not a paid entitlement. Every
-- recruiter plan therefore exposes this feature without a cap. Upsert also
-- covers plans created before the feature catalogue existed.
INSERT INTO "plan_features" (
  "id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at"
)
SELECT gen_random_uuid(), p."id", 'job_post', true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "subscription_plans" p
WHERE p."audience" = 'recruiter'
ON CONFLICT ("plan_id", "feature") DO UPDATE
SET
  "enabled" = true,
  "limit_value" = NULL,
  "updated_at" = CURRENT_TIMESTAMP;

-- The plan-level legacy scalar is retained for API compatibility, but zero makes
-- clear it no longer carries an enforceable allowance. Historical subscription
-- snapshots and quota counters are deliberately left untouched for auditability.
UPDATE "subscription_plans"
SET "job_post_limit" = 0
WHERE "audience" = 'recruiter';
