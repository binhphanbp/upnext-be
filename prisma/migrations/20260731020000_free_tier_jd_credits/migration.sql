-- Re-scope which features are actually metered.
--
-- Publishing a job post, inviting HR seats and contacting candidates are no
-- longer gated by the plan: posting is governed by reputation alone, seats and
-- outreach are free. Only the AI features and boosting remain paid levers.
--
-- The free plan gets 5 AI JD credits so every company can try the feature.

-- 1. Free (0đ) plans: 5 AI JD generations per cycle.
UPDATE "plan_features" pf
SET "limit_value" = 5, "enabled" = true
FROM "subscription_plans" p
WHERE pf."plan_id" = p."id"
  AND pf."feature" = 'ai_jd_generate'
  AND p."price" = 0;

-- 2. Features that are no longer enforced anywhere: mark them unlimited so any
--    stale counter cannot block an action, and so the UI stops advertising a
--    cap the backend does not apply.
UPDATE "plan_features"
SET "limit_value" = NULL, "enabled" = true
WHERE "feature" IN ('job_post', 'hr_seat', 'talent_contact');

UPDATE "subscription_quota_counters"
SET "limit_value" = NULL
WHERE "feature" IN ('job_post', 'hr_seat', 'talent_contact');

-- 3. Keep counters in step with the new free-tier JD allowance.
UPDATE "subscription_quota_counters" c
SET "limit_value" = pf."limit_value"
FROM "company_subscriptions" cs
JOIN "plan_features" pf ON pf."plan_id" = cs."plan_id"
WHERE c."company_subscription_id" = cs."id"
  AND c."feature" = pf."feature"
  AND c."feature" = 'ai_jd_generate';
