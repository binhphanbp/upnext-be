/**
 * Danh mục đóng các loại audit event cấp nghiệp vụ.
 *
 * `AI_TALENT_DISCOVERY_ROLLOUT_PLAN.md` §10 liệt kê tập tối thiểu; §2.6 yêu cầu
 * "mọi lần xem, gợi ý, gửi lời mời, trả lời, block, vi phạm policy và revoke
 * phải audit được".
 *
 * Vì sao là const map chứ không phải Prisma enum: cột `event_type` là
 * `VARCHAR(80)`, cùng lý do `feature-registry.ts` đã chọn — thêm một loại event
 * là thay đổi dữ liệu, không phải migration. Bảo đảm "danh sách đóng" mà enum
 * cho miễn phí thì nằm ở đây, qua `DomainAuditEventType` và
 * `isKnownDomainAuditEvent()`.
 */

export const DOMAIN_AUDIT_EVENTS = {
  // --- Consent (§10) ---
  DISCOVERY_CONSENT_GRANTED: 'DISCOVERY_CONSENT_GRANTED',
  DISCOVERY_CONSENT_REVOKED: 'DISCOVERY_CONSENT_REVOKED',

  // --- Run lifecycle (§10) ---
  DISCOVERY_RUN_CREATED: 'DISCOVERY_RUN_CREATED',
  DISCOVERY_RUN_COMPLETED: 'DISCOVERY_RUN_COMPLETED',
  DISCOVERY_RUN_FAILED: 'DISCOVERY_RUN_FAILED',

  // --- Recruiter đọc dữ liệu ẩn danh (§10) ---
  RECOMMENDATION_VIEWED: 'RECOMMENDATION_VIEWED',
  ANONYMOUS_PROFILE_VIEWED: 'ANONYMOUS_PROFILE_VIEWED',

  // --- Pipeline CV đã redaction (§10) ---
  ANONYMOUS_CV_RENDERED: 'ANONYMOUS_CV_RENDERED',
  ANONYMOUS_CV_BLOCKED_BY_REDACTION: 'ANONYMOUS_CV_BLOCKED_BY_REDACTION',
  ANONYMOUS_CV_INVALIDATED: 'ANONYMOUS_CV_INVALIDATED',

  // --- Lời mời trao đổi (§10) ---
  CONTACT_REQUESTED: 'CONTACT_REQUESTED',
  CONTACT_ACCEPTED: 'CONTACT_ACCEPTED',
  CONTACT_DECLINED: 'CONTACT_DECLINED',
  CONTACT_BLOCKED: 'CONTACT_BLOCKED',
  CONTACT_EXPIRED: 'CONTACT_EXPIRED',

  // --- Policy chặn trao đổi liên hệ (§10) ---
  CONTACT_EXCHANGE_BLOCKED: 'CONTACT_EXCHANGE_BLOCKED',

  // --- Exposure cap (§10) ---
  DISCOVERY_EXPOSURE_RECORDED: 'DISCOVERY_EXPOSURE_RECORDED',
  DISCOVERY_EXPOSURE_CAPPED: 'DISCOVERY_EXPOSURE_CAPPED',

  /**
   * Không có trong danh sách §10 nhưng cần thiết: sanitizer phát hiện PII còn
   * sót trong discovery text và fail closed *trước khi* gọi embedding provider.
   * Đây là tín hiệu bảo mật, không phải lỗi vận hành — §7.4 đặt "zero PII trong
   * provider mock" làm điều kiện vào beta, nên nó phải đếm được.
   */
  DISCOVERY_TEXT_PII_BLOCKED: 'DISCOVERY_TEXT_PII_BLOCKED',
} as const;

export type DomainAuditEventType = (typeof DOMAIN_AUDIT_EVENTS)[keyof typeof DOMAIN_AUDIT_EVENTS];

export function isKnownDomainAuditEvent(value: string): value is DomainAuditEventType {
  return Object.values<string>(DOMAIN_AUDIT_EVENTS).includes(value);
}

export const DOMAIN_AUDIT_AGGREGATES = {
  CANDIDATE_PROFILE: 'CANDIDATE_PROFILE',
  TALENT_DISCOVERY_RUN: 'TALENT_DISCOVERY_RUN',
  TALENT_DISCOVERY_RECOMMENDATION: 'TALENT_DISCOVERY_RECOMMENDATION',
  TALENT_CONTACT_REQUEST: 'TALENT_CONTACT_REQUEST',
  CONVERSATION: 'CONVERSATION',
  ANONYMOUS_CV_ARTIFACT: 'ANONYMOUS_CV_ARTIFACT',
  TALENT_DISCOVERY_INDEX: 'TALENT_DISCOVERY_INDEX',
} as const;

export type DomainAuditAggregateType =
  (typeof DOMAIN_AUDIT_AGGREGATES)[keyof typeof DOMAIN_AUDIT_AGGREGATES];

/**
 * Khoá metadata được phép ghi, theo từng loại event.
 *
 * Đây là allowlist, không phải blocklist, và đó là điểm chính: §10 nói "không
 * log raw request payload chứa CV, contact data hoặc model prompt". Một
 * blocklist đòi ta phải đoán trước mọi tên khoá tệ; allowlist thì một khoá mới
 * bị bỏ theo mặc định cho tới khi ai đó thêm nó vào đây một cách có ý thức.
 *
 * Quy tắc khi thêm khoá: chỉ id, code, số đếm, enum, version và timestamp. Không
 * bao giờ là văn bản tự do do người dùng gõ hay trích từ CV.
 */
export const DOMAIN_AUDIT_METADATA_KEYS: Record<DomainAuditEventType, readonly string[]> = {
  DISCOVERY_CONSENT_GRANTED: ['consentVersion', 'allowInvitations', 'allowRedactedCvView'],
  DISCOVERY_CONSENT_REVOKED: ['consentVersion', 'reason', 'indexDeactivated'],

  DISCOVERY_RUN_CREATED: [
    'jobPostId',
    'matchingFingerprint',
    'fingerprintVersion',
    'scoringVersion',
    'maxResults',
    'reusedSnapshot',
  ],
  DISCOVERY_RUN_COMPLETED: [
    'jobPostId',
    'resultCount',
    'maxResults',
    'zeroResultReason',
    'supplyReason',
    'scoringVersion',
    'retrievalPath',
    'durationMs',
  ],
  DISCOVERY_RUN_FAILED: ['jobPostId', 'errorCode', 'attemptCount', 'usageReversed'],

  RECOMMENDATION_VIEWED: ['runId', 'recommendationCount'],
  ANONYMOUS_PROFILE_VIEWED: ['runId', 'recommendationId', 'documentAvailable'],

  ANONYMOUS_CV_RENDERED: ['artifactId', 'pageCount', 'rendererVersion', 'policyVersion'],
  ANONYMOUS_CV_BLOCKED_BY_REDACTION: ['artifactId', 'blockedRuleIds', 'blockedReason', 'layer'],
  ANONYMOUS_CV_INVALIDATED: ['artifactId', 'reason'],

  CONTACT_REQUESTED: ['requestId', 'recommendationId', 'jobPostId', 'source'],
  CONTACT_ACCEPTED: ['requestId', 'conversationId'],
  CONTACT_DECLINED: ['requestId', 'reasonCode'],
  CONTACT_BLOCKED: ['requestId', 'reasonCode'],
  CONTACT_EXPIRED: ['requestId'],

  CONTACT_EXCHANGE_BLOCKED: ['surface', 'ruleIds', 'conversationId', 'matchCount', 'contentLength'],

  DISCOVERY_EXPOSURE_RECORDED: ['runId', 'jobPostId', 'nextEligibleAt'],
  DISCOVERY_EXPOSURE_CAPPED: ['runId', 'jobPostId', 'openWindowCount', 'maxCompanies'],

  DISCOVERY_TEXT_PII_BLOCKED: ['ruleIds', 'sanitizerVersion', 'textLength'],
};
