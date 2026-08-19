-- Two catalogue defects that only a data change can fix: neither `duration_days` on
-- the auto-provisioned free plan nor `is_public` is exposed by
-- UpdateSubscriptionPlanDto, so an admin cannot correct either through the API, and
-- staging runs `prisma migrate deploy` without re-running the seed.
--
-- Idempotent: both statements are narrowly scoped and re-running them is a no-op.

-- 1. The free plan's `duration_days` IS the reset cadence of the free allowance.
--    When a free subscription expires, entitlement resolution provisions a fresh one
--    with counters at zero, so a 14-day free plan renews the free AI allowance more
--    than twice a month -- double what the pricing table advertises.  Every other
--    plan, and the candidate free plan, use a 30-day cycle.
--
--    Scoped to the recruiter free plan at exactly 14 days so an intentional future
--    change to a different value is not silently reverted by a re-run.
UPDATE "subscription_plans"
SET "duration_days" = 30
WHERE "code" = 'RECRUITER_BASIC'
  AND "audience" = 'recruiter'
  AND "price" = 0
  AND "duration_days" = 14;

-- 2. Candidate sandbox checkout only accepts a plan with `is_public = true`.  With the
--    seeded value of false, every candidate upgrade attempt returns
--    SUBSCRIPTION_PLAN_NOT_AVAILABLE, which makes the shipped candidate lifecycle
--    untestable.  Clear the "Sắp ra mắt" badge at the same time: once the plan can be
--    bought, that label is no longer true.
UPDATE "subscription_plans"
SET "is_public" = true,
    "highlight_label" = NULL
WHERE "code" = 'CANDIDATE_PRO'
  AND "is_public" = false;

-- Deliberately NOT touched: candidate/company subscriptions already carrying a
-- 14-day `expired_at`.  Extending a live period would move a cycle boundary
-- underneath a user mid-cycle; those rows self-correct at the next rollover, which
-- costs at most one short free cycle and keeps this migration side-effect free on
-- subscription state.
