/**
 * Định nghĩa duy nhất cho câu hỏi "hồ sơ ứng viên nào được phép hiển thị với
 * một công ty" -- cho luồng liên hệ trực tiếp (Kho CV, talent contact).
 *
 * Trước module này, cùng một quy tắc được viết lại **ba lần** và cả ba đã phân
 * kỳ:
 *
 * | Nơi | open+public | consent | block | đã ứng tuyển |
 * | --- | --- | --- | --- | --- |
 * | `talent-pool.service.ts:17-21`        | ✓ | legacy | **thiếu** | **thiếu** |
 * | `talent-contact.service.ts:612-637`   | ✓ | legacy | ✓ (query riêng) | ✓ (query riêng) |
 * | `talent-recommendation.service.ts:50` | ✓ | legacy | ✓ | ✓ |
 *
 * Hai ô "thiếu" ở dòng đầu là một lỗ hổng quyền riêng tư đang sống: ứng viên
 * chặn công ty X thì X vẫn thấy họ trong kho CV, và `unlock()` vẫn bán được
 * tên/email/SĐT của họ.
 *
 * File này là **pure** (không DI, chỉ phụ thuộc `@prisma/client`) theo đúng
 * khuôn `cv-screening/screening-text.ts`, nên mọi module đều import được mà
 * không tạo vòng phụ thuộc.
 *
 * Trước đây file này còn có một builder song song cho AI Talent Discovery
 * (`buildDiscoveryEligibilityWhere`, `DISCOVERY_CONSENT_WHERE`,
 * `discoveryEligibilitySql`) -- tính năng đó đã bị bỏ và code tương ứng đã xoá
 * cùng `src/modules/talent-discovery/`. Chỉ builder liên hệ trực tiếp còn lại.
 */

import {
  CandidateContactPreferenceStatus,
  JobSearchStatus,
  Prisma,
  ProfileVisibility,
} from '@prisma/client';

/** Trạng thái hồ sơ do chính ứng viên đặt. */
export const OPEN_AND_PUBLIC_WHERE = {
  jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
  profileVisibility: ProfileVisibility.PUBLIC,
} as const satisfies Prisma.CandidateProfileWhereInput;

/** Consent liên hệ trực tiếp (luồng cũ: kho CV, talent contact). */
export const LEGACY_CONTACT_CONSENT_WHERE = {
  contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
} as const satisfies Prisma.CandidateProfileWhereInput;

/** Ứng viên chưa chặn công ty này. `revokedAt: null` = chặn còn hiệu lực. */
export function notBlockedByCandidate(companyId: string): Prisma.CandidateProfileWhereInput {
  return { companyBlocks: { none: { companyId, revokedAt: null } } };
}

/** Ứng viên chưa ứng tuyển vào tin này — họ đã ở trong luồng application. */
export function hasNotApplied(jobPostId: string): Prisma.CandidateProfileWhereInput {
  return { applications: { none: { jobPostId } } };
}

export type EligibilityScope = {
  /** Công ty đang đọc. Bắt buộc: mọi predicate đều có mảnh "chưa bị chặn". */
  companyId: string;
  /** Chỉ truyền khi ngữ cảnh gắn với một tin cụ thể. */
  jobPostId?: string;
};

/**
 * Predicate cho luồng liên hệ trực tiếp (kho CV, talent contact cũ).
 *
 * Có mảnh block mà hai bản cũ ở `talent-pool.service.ts` bỏ sót.
 */
export function buildLegacyContactEligibilityWhere(
  scope: EligibilityScope,
): Prisma.CandidateProfileWhereInput {
  return {
    ...OPEN_AND_PUBLIC_WHERE,
    ...LEGACY_CONTACT_CONSENT_WHERE,
    ...notBlockedByCandidate(scope.companyId),
    ...(scope.jobPostId ? hasNotApplied(scope.jobPostId) : {}),
  };
}
