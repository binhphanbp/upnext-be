-- Backfill the new quota tables from the legacy hard-coded columns so existing
-- plans and live subscriptions keep working the moment quota enforcement is
-- switched on. Without this, every metered action would fail with
-- FEATURE_NOT_IN_PLAN for companies that subscribed before this release.
--
-- Idempotent: re-running only fills gaps.

-- 1. Namespace plan codes for plans that do not have one yet. "Pro" is a tier
--    name on both the recruiter and candidate side of the pricing table, so the
--    code must carry the audience.
UPDATE "subscription_plans"
SET "code" = 'RECRUITER_' || upper(regexp_replace("subscription_name", '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "code" IS NULL;

-- 2. Derive PlanFeature rows from the legacy limit columns.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'job_post', p."job_post_limit" > 0, p."job_post_limit", now(), now()
FROM "subscription_plans" p
ON CONFLICT ("plan_id", "feature") DO NOTHING;

INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'talent_contact', p."talent_contact_limit" > 0, p."talent_contact_limit", now(), now()
FROM "subscription_plans" p
ON CONFLICT ("plan_id", "feature") DO NOTHING;

-- Boost credits map onto the "featured job" allowance in the new model.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'featured_job', p."boost_credit_limit" > 0, p."boost_credit_limit", now(), now()
FROM "subscription_plans" p
ON CONFLICT ("plan_id", "feature") DO NOTHING;

-- Features that had no legacy column: enable them with a conservative
-- allowance derived from the plan's job post limit so paid plans are not
-- silently locked out. Admin can tune real numbers afterwards.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", f."feature", p."job_post_limit" > 0, f."limit_multiplier" * p."job_post_limit", now(), now()
FROM "subscription_plans" p
CROSS JOIN (VALUES
  ('cv_pool_view'::"SubscriptionFeature",   15),
  ('ai_cv_matching'::"SubscriptionFeature", 50),
  ('ai_jd_generate'::"SubscriptionFeature",  5),
  ('urgent_label'::"SubscriptionFeature",    1)
) AS f("feature", "limit_multiplier")
ON CONFLICT ("plan_id", "feature") DO NOTHING;

-- HR seats do not scale with job posts; give every plan at least one seat.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'hr_seat', true, GREATEST(1, p."job_post_limit" / 10), now(), now()
FROM "subscription_plans" p
ON CONFLICT ("plan_id", "feature") DO NOTHING;

-- 3. Give live subscriptions a quota window. Legacy rows only had
--    started_at/expired_at, which the service falls back to, but setting them
--    explicitly keeps period handling uniform.
UPDATE "company_subscriptions"
SET "current_period_start" = "started_at",
    "current_period_end"   = "expired_at"
WHERE "current_period_start" IS NULL;

-- 4. Materialise counters for active subscriptions, carrying over the usage
--    already recorded in the legacy *_used columns so nobody gets free quota.
INSERT INTO "subscription_quota_counters"
  ("id", "company_subscription_id", "feature", "limit_value", "used_value", "period_start", "period_end", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  cs."id",
  pf."feature",
  pf."limit_value",
  CASE pf."feature"
    WHEN 'job_post'       THEN cs."job_post_used"
    WHEN 'talent_contact' THEN cs."talent_contact_used"
    WHEN 'featured_job'   THEN cs."boost_credit_used"
    ELSE 0
  END,
  COALESCE(cs."current_period_start", cs."started_at"),
  COALESCE(cs."current_period_end", cs."expired_at"),
  now(),
  now()
FROM "company_subscriptions" cs
JOIN "plan_features" pf ON pf."plan_id" = cs."plan_id"
WHERE cs."status" = 'active'
ON CONFLICT ("company_subscription_id", "feature", "period_start") DO NOTHING;
