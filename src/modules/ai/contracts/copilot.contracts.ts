import { z } from 'zod';

/**
 * Hợp đồng giữa backend và frontend cho AI Copilot.
 *
 * ADR-001 §5.2 yêu cầu hợp đồng là *dữ liệu*, không phải type TypeScript, để một
 * service Python sau này dùng được cùng định nghĩa. Nguồn sự thật là các zod
 * schema dưới đây; `scripts/export-ai-contracts.ts` sinh ra JSON Schema từ chúng
 * và contract test so JSON Schema với type của frontend.
 *
 * Mọi thứ model sinh ra đều phải đi qua `parse()` ở đây trước khi ghi DB hoặc
 * gửi cho client. Đây là chỗ chặn rủi ro "LLM trả sai format"
 * (KE-HOACH-AI-REVIEW.md §26 rủi ro 4) — không có đường nào khác vào response.
 */

export const AI_INTENTS = [
  'GENERAL_GUIDANCE',
  'CV_ANALYSIS',
  'JOB_SEARCH',
  'JOB_COMPARISON',
  'APPLICATION_STATUS',
  'MOCK_INTERVIEW',
  'SKILL_GAP',
  'OUT_OF_SCOPE',
] as const;

export const aiIntentSchema = z.enum(AI_INTENTS);
export type AiIntent = z.infer<typeof aiIntentSchema>;

/** §19.2 — mọi lỗi UI phải giải thích được cho người dùng. */
export const AI_ERROR_CODES = [
  'AI_MODEL_TIMEOUT',
  'AI_MODEL_RATE_LIMIT',
  'AI_INVALID_OUTPUT',
  'AI_TOOL_NOT_ALLOWED',
  'AI_TOOL_FAILED',
  'AI_CONTEXT_NOT_FOUND',
  'AI_CONTEXT_FORBIDDEN',
  'AI_BUDGET_EXCEEDED',
  'AI_SERVICE_UNAVAILABLE',
] as const;

export const aiErrorCodeSchema = z.enum(AI_ERROR_CODES);
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;

/**
 * Trạng thái gửi cho client. Rộng hơn `AiRunStatus` của Prisma vì UI cần phân
 * biệt nguyên nhân dừng (hết hạn mức vs mất dịch vụ vs bị chặn quyền) để hiện
 * đúng thông báo, còn DB chỉ cần biết lượt chạy kết thúc thế nào.
 */
export const aiClientStatusSchema = z.enum([
  'queued',
  'processing',
  'streaming',
  'completed',
  'partial',
  'failed',
  'rate_limited',
  'permission_denied',
  'model_unavailable',
]);

/* -------------------------------------------------------------------------- */
/* Grounding                                                                   */
/* -------------------------------------------------------------------------- */

export const aiCitationSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().positive(),
  sourceType: z.enum(['CV', 'JOB', 'APPLICATION', 'PROFILE', 'POLICY', 'INTERVIEW']),
  sourceId: z.string().min(1),
  title: z.string().min(1).max(240),
  excerpt: z.string().min(1).max(600),
  href: z.string().max(500).optional(),
});
export type AiCitation = z.infer<typeof aiCitationSchema>;

export const aiToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  status: z.enum(['running', 'succeeded', 'failed', 'blocked']),
  detail: z.string().max(240).optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type AiToolCall = z.infer<typeof aiToolCallSchema>;

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

const scoreSchema = z.number().min(0).max(100);

const breakdownItemSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  score: scoreSchema,
  weight: z.number().min(0).max(1),
  /** Dimension không có dữ liệu — KHÔNG bị chấm 0 điểm (§11.5). */
  unknown: z.boolean().optional(),
});

export const jobMatchCardSchema = z.object({
  type: z.literal('job_match'),
  jobId: z.string().min(1),
  title: z.string().min(1).max(200),
  companyName: z.string().max(200),
  location: z.string().max(200),
  workingModel: z.string().max(60),
  salaryLabel: z.string().max(120).optional(),
  /** §11.4 — độ phù hợp. */
  totalScore: scoreSchema,
  /** §11.4 — độ đầy đủ của dữ liệu dùng để tính. Tách hẳn khỏi totalScore. */
  confidenceScore: scoreSchema,
  confidenceReason: z.string().max(300).optional(),
  breakdown: z.array(breakdownItemSchema).max(12),
  matchedSkills: z.array(z.string().max(80)).max(30),
  missingSkills: z.array(z.string().max(80)).max(30),
  toVerify: z.array(z.string().max(160)).max(10),
  algorithmVersion: z.string().max(40),
  href: z.string().max(500),
});

export const cvAnalysisCardSchema = z.object({
  type: z.literal('cv_analysis'),
  cvVersionId: z.string().min(1),
  cvName: z.string().max(200),
  overallScore: scoreSchema,
  scores: z.object({
    completeness: scoreSchema,
    clarity: scoreSchema,
    impact: scoreSchema,
    atsReadiness: scoreSchema,
  }),
  /** Mỗi nhận xét bắt buộc có dẫn chứng từ CV (§8.1 acceptance criteria). */
  strengths: z.array(z.object({ text: z.string().max(300), evidence: z.string().max(400) })).max(8),
  weaknesses: z
    .array(z.object({ text: z.string().max(300), evidence: z.string().max(400) }))
    .max(8),
  missingSections: z.array(z.string().max(80)).max(10),
  href: z.string().max(500),
});

export const skillGapCardSchema = z.object({
  type: z.literal('skill_gap'),
  jobTitle: z.string().max(200),
  gaps: z
    .array(
      z.object({
        skill: z.string().max(80),
        importance: z.enum(['required', 'nice_to_have']),
        /** `unproven` khác `missing`: có khai nhưng không có dẫn chứng. */
        status: z.enum(['missing', 'partial', 'unproven']),
        note: z.string().max(300),
      }),
    )
    .max(20),
  preparationQuestions: z.array(z.string().max(300)).max(10),
});

export const applicationStatusCardSchema = z.object({
  type: z.literal('application_status'),
  applicationId: z.string().min(1),
  jobTitle: z.string().max(200),
  companyName: z.string().max(200),
  status: z.string().max(60),
  statusTone: z.enum(['neutral', 'info', 'success', 'warning', 'error']),
  appliedAt: z.string().max(40),
  timeline: z
    .array(
      z.object({
        label: z.string().max(60),
        at: z.string().max(40),
        state: z.enum(['done', 'current', 'upcoming']),
      }),
    )
    .max(10),
  href: z.string().max(500),
});

export const interviewFeedbackCardSchema = z.object({
  type: z.literal('interview_feedback'),
  questionIndex: z.number().int().positive(),
  questionTotal: z.number().int().positive(),
  question: z.string().max(600),
  score: scoreSchema,
  dimensions: z.object({
    technicalCorrectness: z.number().int().min(0).max(40),
    relevance: z.number().int().min(0).max(20),
    depth: z.number().int().min(0).max(15),
    clarity: z.number().int().min(0).max(15),
    practicalEvidence: z.number().int().min(0).max(10),
  }),
  strengths: z.array(z.string().max(300)).max(8),
  missingPoints: z.array(z.string().max(300)).max(8),
  href: z.string().max(500),
});

export const aiCardSchema = z.discriminatedUnion('type', [
  jobMatchCardSchema,
  cvAnalysisCardSchema,
  skillGapCardSchema,
  applicationStatusCardSchema,
  interviewFeedbackCardSchema,
]);
export type AiCard = z.infer<typeof aiCardSchema>;

/* -------------------------------------------------------------------------- */
/* Human-in-the-loop                                                           */
/* -------------------------------------------------------------------------- */

export const AI_ACTION_TYPES = [
  'APPLY_CV_SUGGESTION',
  'SAVE_JOB',
  'UPDATE_JOB_PREFERENCE',
] as const;

export const aiActionRequestSchema = z.object({
  id: z.string().min(1),
  actionType: z.enum(AI_ACTION_TYPES),
  title: z.string().max(200),
  description: z.string().max(600),
  /** Chính xác những gì sẽ được ghi. Không có thay đổi ẩn. */
  changes: z
    .array(
      z.object({
        label: z.string().max(80),
        from: z.string().max(600).optional(),
        to: z.string().max(600),
      }),
    )
    .min(1)
    .max(10),
  confirmLabel: z.string().max(60),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED']),
});
export type AiActionRequestPayload = z.infer<typeof aiActionRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Streaming events (§13.3)                                                    */
/* -------------------------------------------------------------------------- */

export const aiRunMetaSchema = z.object({
  model: z.string().max(80),
  promptVersion: z.string().max(60),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export const aiStreamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('status'),
    data: z.object({ step: aiClientStatusSchema, label: z.string().max(120).optional() }),
  }),
  z.object({ event: z.literal('intent'), data: z.object({ intent: aiIntentSchema }) }),
  z.object({ event: z.literal('tool_start'), data: z.object({ tool: aiToolCallSchema }) }),
  z.object({
    event: z.literal('tool_result'),
    data: z.object({
      id: z.string(),
      status: z.enum(['running', 'succeeded', 'failed', 'blocked']),
      detail: z.string().max(240).optional(),
      durationMs: z.number().int().nonnegative(),
    }),
  }),
  z.object({ event: z.literal('content_delta'), data: z.object({ text: z.string() }) }),
  z.object({ event: z.literal('card'), data: z.object({ card: aiCardSchema }) }),
  z.object({ event: z.literal('citation'), data: z.object({ citation: aiCitationSchema }) }),
  z.object({
    event: z.literal('action_request'),
    data: z.object({ actionRequest: aiActionRequestSchema }),
  }),
  z.object({
    event: z.literal('suggestions'),
    data: z.object({ suggestions: z.array(z.string().max(200)).max(6) }),
  }),
  z.object({
    event: z.literal('error'),
    data: z.object({
      code: aiErrorCodeSchema,
      detail: z.string().max(600),
      status: aiClientStatusSchema,
    }),
  }),
  z.object({
    event: z.literal('done'),
    data: z.object({ messageId: z.string(), meta: aiRunMetaSchema }),
  }),
]);
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;

/* -------------------------------------------------------------------------- */
/* Model output — cái LLM được phép trả về                                     */
/* -------------------------------------------------------------------------- */

/**
 * Bước 1 của orchestrator: phân loại intent và chọn tool.
 *
 * Model KHÔNG được tự đặt tên tool — `name` sẽ được đối chiếu với registry của
 * đúng role hiện tại, tên lạ bị chặn và ghi log (§16.1). Đây là lý do bước này
 * tách khỏi bước sinh câu trả lời: quyết định gọi gì phải kiểm được trước khi
 * chạy, không phải phát hiện giữa dòng stream.
 */
/**
 * `nullish()` chứ không phải `optional()`, và đây là khác biệt có thật.
 *
 * JSON Schema gửi cho Gemini khai `nullable: true` cho `argument` và
 * `refusalReason`. Model tuân thủ đúng: khi không có giá trị nó trả `null`, chứ
 * không bỏ trống field. `optional()` của zod chỉ chấp nhận *thiếu field*, nên
 * `null` bị từ chối và cả lượt trả lời hỏng với `AI_INVALID_OUTPUT` — trong khi
 * model không làm gì sai.
 *
 * `.transform()` quy `null` về `undefined` để phần còn lại của code chỉ phải xử
 * lý một dạng "không có giá trị".
 */
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? undefined);

export const intentPlanSchema = z.object({
  intent: aiIntentSchema,
  toolCalls: z
    .array(
      z.object({
        name: z.string().max(60),
        /** Chỉ nhận UUID hoặc chuỗi ngắn — §16.1 "tool chỉ nhận UUID hợp lệ". */
        argument: nullableText(120),
      }),
    )
    .max(3),
  /** Model tự nhận biết câu hỏi ngoài phạm vi thay vì cố trả lời bừa. */
  refusalReason: nullableText(300),
});
export type IntentPlan = z.infer<typeof intentPlanSchema>;
