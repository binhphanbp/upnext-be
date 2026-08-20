/**
 * Single source of truth for subscription feature keys (D2,
 * KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 18). `feature` columns on
 * `plan_features`, `subscription_quota_counters`, `subscription_usages`,
 * `ai_usage_logs`, `candidate_subscription_quota_counters` and
 * `candidate_subscription_usages` are `VARCHAR(60)`, not a Postgres enum --
 * adding a capability (e.g. the upcoming B2C AI keys) is a data change, not a
 * migration touching six tables. The closed-list guarantee an enum gave for
 * free now lives here instead: `IsEnum(SubscriptionFeature)` at DTO
 * boundaries, and `isKnownFeature()` for any other free-text check.
 */

export type FeatureType = 'METERED' | 'CONCURRENT';
export type FeatureAudience = 'RECRUITER' | 'CANDIDATE';

export interface FeatureDefinition {
  key: string;
  /** METERED: `consume()` drains a per-period counter. CONCURRENT: enforcement
   * counts live rows against the limit instead (e.g. active job posts, seats). */
  type: FeatureType;
  audience: FeatureAudience;
}

export const FEATURES = {
  JOB_POST: { key: 'job_post', type: 'CONCURRENT', audience: 'RECRUITER' },
  /** Also covers `URGENT` boosts -- `JobBoostService` always consumes this key
   * regardless of `JobBoost.type` (mục 15.2 của plan doc). */
  FEATURED_JOB: { key: 'featured_job', type: 'METERED', audience: 'RECRUITER' },
  /** Không nơi nào `consume()` key này -- xem mục 16/17 của plan doc. Giữ lại
   * trong registry để không phá vỡ dữ liệu/enum value lịch sử, không phải vì
   * còn được dùng. */
  URGENT_LABEL: { key: 'urgent_label', type: 'METERED', audience: 'RECRUITER' },
  CV_POOL_VIEW: { key: 'cv_pool_view', type: 'METERED', audience: 'RECRUITER' },
  TALENT_CONTACT: { key: 'talent_contact', type: 'METERED', audience: 'RECRUITER' },
  HR_SEAT: { key: 'hr_seat', type: 'CONCURRENT', audience: 'RECRUITER' },
  AI_CV_MATCHING: { key: 'ai_cv_matching', type: 'METERED', audience: 'RECRUITER' },
  AI_JD_GENERATE: { key: 'ai_jd_generate', type: 'METERED', audience: 'RECRUITER' },
  AI_COPILOT_RUN: { key: 'ai_copilot_run', type: 'METERED', audience: 'CANDIDATE' },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureName = keyof typeof FEATURES;
export type SubscriptionFeature = (typeof FEATURES)[FeatureName]['key'];

/**
 * Drop-in replacement for the Prisma enum this migration removed: same member
 * names, same string values. Every existing `SubscriptionFeature.JOB_POST`
 * call site keeps working after switching its import to this module --
 * `IsEnum`, `ApiProperty({ enum: ... })` and `Object.keys(...).length` all
 * operate on the runtime shape, which is unchanged.
 */
export const SubscriptionFeature = Object.fromEntries(
  Object.entries(FEATURES).map(([name, def]) => [name, def.key]),
) as { [K in FeatureName]: (typeof FEATURES)[K]['key'] };

export function isKnownFeature(value: string): value is SubscriptionFeature {
  return Object.values(FEATURES).some((def) => def.key === value);
}

export function getFeatureDefinition(key: SubscriptionFeature): FeatureDefinition {
  const found = Object.values(FEATURES).find((def) => def.key === key);
  if (!found) throw new Error(`Unknown feature key: ${key}`);
  return found;
}
