import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActorType, AiConversationContext, AiRunStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionFeature } from '../../subscriptions/feature-registry';
import { estimateGeminiCostVnd } from '../../cv-screening/gemini-scoring.service';
import {
  AI_INTENTS,
  AiCard,
  AiCitation,
  AiErrorCode,
  AiIntent,
  AiStreamEvent,
  AiToolCall,
  IntentPlan,
  intentPlanSchema,
} from '../contracts/copilot.contracts';
import {
  CandidateContextAssembler,
  CandidateProfileContext,
  JobPostContext,
} from '../context/candidate-context.assembler';
import { computeCvQuality } from '../matching/cv-quality';
import { computeSkillCoverage } from '../matching/skill-coverage';
import { LLM_PROVIDER, LlmProviderPort } from '../ports/llm-provider.port';
import {
  CANDIDATE_ANSWER_PROMPT_VERSION,
  CANDIDATE_ROUTER_PROMPT_VERSION,
  candidateAnswerPrompt,
  candidateOutOfScopeAnswer,
  candidateRouterPrompt,
  candidateToolDeniedAnswer,
  normalizeCopilotLocale,
  routerResponseSchema,
} from '../prompts/candidate-copilot.prompts';
import { ToolRegistryService } from '../tools/tool-registry.service';
import {
  CandidateKnowledgeRetrievalService,
  CandidateKnowledgeSearchResult,
} from '../retrieval/candidate-knowledge-retrieval.service';
import { AiActionsService } from './ai-actions.service';
import { AiConversationsService } from './ai-conversations.service';

/**
 * Điều phối một lượt hội thoại.
 *
 * Luồng theo §13.1, nhưng cố ý **không** dùng function-calling vòng lặp của nhà
 * cung cấp. Thay vào đó hai bước tách bạch:
 *
 *   1. Router (model rẻ, structured output) → intent + danh sách tool cần gọi.
 *   2. Tổng hợp (model tốt hơn, streaming) → câu trả lời từ dữ liệu tool đã lấy.
 *
 * Vì sao tách: quyết định "gọi tool nào" phải **kiểm được trước khi chạy**, không
 * phải phát hiện giữa dòng stream. Với vòng lặp function-calling, một model bị
 * prompt injection có thể xin gọi tool ở token thứ 500 và ta phải huỷ nửa câu trả
 * lời đã gửi cho người dùng. Ở đây tool được duyệt xong mới bắt đầu stream, nên
 * §13.4 (tối đa 5 tool call) trở thành ràng buộc cấu trúc chứ không phải bộ đếm.
 *
 * Hệ quả thứ hai: **thẻ kết quả và điểm số do backend tính**, không do model
 * sinh ra (§11.1). Model chỉ viết phần diễn giải.
 */

const MAX_TOOL_CALLS = 3;
/**
 * Truyền tường minh thay vì để `GeminiLlmAdapter` tự áp giá trị mặc định của nó
 * (`?? 2048`). Trần chi phí của một câu trả lời là quyết định nghiệp vụ, không
 * nên phụ thuộc vào một giá trị ẩn bên trong tầng adapter — nếu ai đó đổi mặc
 * định của adapter cho một use case khác, Copilot vẫn phải giữ đúng con số này.
 */
const ANSWER_MAX_OUTPUT_TOKENS = 2048;
const suggestionsFor = (locale: string) =>
  normalizeCopilotLocale(locale) === 'en'
    ? ['Analyse my CV', 'Find matching jobs', 'Check my application status']
    : ['Phân tích CV của tôi', 'Tìm việc phù hợp', 'Kiểm tra trạng thái ứng tuyển'];

export type CopilotRunInput = {
  conversationId: string;
  candidateProfileId: string;
  candidateAccountId: string;
  prompt: string;
  /** Ngữ cảnh trang (§8.3) — quyết định tool nào nhận được id nào. */
  contextType: AiConversationContext;
  contextId: string | null;
  locale: string;
  signal: AbortSignal;
};

type ToolOutcome = {
  call: AiToolCall;
  data: unknown;
};

@Injectable()
export class AiCopilotService {
  private readonly logger = new Logger(AiCopilotService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProviderPort,
    private readonly tools: ToolRegistryService,
    private readonly context: CandidateContextAssembler,
    private readonly conversations: AiConversationsService,
    private readonly actions: AiActionsService,
    private readonly prisma: PrismaService,
    private readonly knowledge: CandidateKnowledgeRetrievalService,
  ) {}

  /**
   * Chạy một lượt và phát ra event theo §13.3.
   *
   * Generator này **không bao giờ throw**. Mọi lỗi trở thành event `error` rồi
   * kết thúc bình thường — nếu throw, client đang đọc SSE sẽ thấy kết nối đứt
   * mà không biết vì sao, và tin nhắn trợ lý bị treo ở trạng thái STREAMING.
   */
  async *run(input: CopilotRunInput): AsyncGenerator<AiStreamEvent> {
    const traceId = randomUUID();
    const startedAt = Date.now();

    const assistant = await this.conversations.createAssistantPlaceholder(input.conversationId);

    let content = '';
    let intent: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    // Overwritten by the answer stream's own `usage` chunk, which carries the
    // model that actually served the call. `this.llm.modelName` is only a
    // static fallback-adapter label and never reflects that -- see
    // `LlmStreamChunk`'s doc comment.
    let modelName = this.llm.modelName;
    let blockedToolCount = 0;
    const toolCalls: AiToolCall[] = [];
    const citations: AiCitation[] = [];
    const cards: AiCard[] = [];
    let suggestions: string[] = [];
    let errorCode: AiErrorCode | null = null;
    let finalStatus: AiRunStatus = AiRunStatus.STREAMING;

    try {
      if (!this.llm.isConfigured()) {
        throw new Error('AI_SERVICE_UNAVAILABLE');
      }

      yield { event: 'status', data: { step: 'queued' } };

      /* ---------------- Bước 1: router ---------------- */

      const availableTools = this.tools.listFor(ActorType.CANDIDATE);
      const persistedHistory = await this.conversations.recentTurns(input.conversationId);
      // Controller ghi prompt người dùng trước khi khởi chạy để bảo toàn lịch sử.
      // Không đưa chính prompt đó vào model hai lần ở cùng một lượt.
      const history =
        persistedHistory.at(-1)?.role === 'USER' &&
        persistedHistory.at(-1)?.content === input.prompt
          ? persistedHistory.slice(0, -1)
          : persistedHistory;

      const routed = await this.llm.generateStructured({
        systemInstruction: candidateRouterPrompt(availableTools),
        messages: [
          ...history.map((turn) => ({
            role: turn.role === 'USER' ? ('user' as const) : ('model' as const),
            text: turn.content,
          })),
          {
            role: 'user' as const,
            text: this.routerUserMessage(input),
          },
        ],
        responseSchema: routerResponseSchema(AI_INTENTS),
        ...(input.signal ? { signal: input.signal } : {}),
      });

      inputTokens += routed.inputTokens;
      outputTokens += routed.outputTokens;

      const plan = intentPlanSchema.safeParse(routed.value);
      if (!plan.success) {
        this.logger.warn(`Router trả output không hợp lệ: ${plan.error.message.slice(0, 200)}`);
        throw new Error('AI_INVALID_OUTPUT');
      }

      const effectivePlan = this.enforceBusinessPlan(plan.data, input);
      intent = effectivePlan.intent;
      yield { event: 'intent', data: { intent: effectivePlan.intent } };

      /* ---------------- Ngoài phạm vi: không gọi model lần hai ---------------- */

      if (effectivePlan.intent === 'OUT_OF_SCOPE') {
        content = candidateOutOfScopeAnswer(input.locale);
        suggestions = suggestionsFor(input.locale);
        finalStatus = AiRunStatus.COMPLETED;

        for (const chunk of chunkText(content)) {
          yield { event: 'content_delta', data: { text: chunk } };
        }
        yield { event: 'suggestions', data: { suggestions } };
        return;
      }

      /* ---------------- Bước 2: chạy tool ---------------- */

      yield { event: 'status', data: { step: 'processing' } };

      const outcomes: ToolOutcome[] = [];

      for (const requested of effectivePlan.toolCalls.slice(0, MAX_TOOL_CALLS)) {
        const call: AiToolCall = {
          id: randomUUID(),
          name: requested.name,
          label: this.tools.labelFor(ActorType.CANDIDATE, requested.name, input.locale),
          status: 'running',
        };
        const toolStartedAt = Date.now();

        toolCalls.push(call);
        // Phải phát trước await để client thấy tiến độ thật thay vì một timeline
        // “đang chạy” xuất hiện sau khi truy vấn đã hoàn tất.
        yield { event: 'tool_start', data: { tool: { ...call } } };

        const result = await this.tools.execute(requested.name, {
          actorType: ActorType.CANDIDATE,
          ownerId: input.candidateProfileId,
          argument: requested.argument ?? this.contextArgumentFor(requested.name, input),
          locale: input.locale,
        });

        call.label = result.label;
        call.status = result.status;
        call.detail = result.detail;
        call.durationMs = Date.now() - toolStartedAt;
        yield {
          event: 'tool_result',
          data: {
            id: call.id,
            status: result.status,
            detail: result.detail,
            durationMs: call.durationMs,
          },
        };

        if (result.status === 'blocked') {
          blockedToolCount += 1;
          continue;
        }
        if (result.status === 'succeeded') {
          outcomes.push({ call, data: result.data });
        }
      }

      /* ---------------- Bị chặn quyền: trả lời rõ ràng, không gọi model ---------------- */

      if (blockedToolCount > 0 && outcomes.length === 0) {
        content = candidateToolDeniedAnswer(input.locale);
        suggestions = suggestionsFor(input.locale);
        errorCode = 'AI_TOOL_NOT_ALLOWED';
        finalStatus = AiRunStatus.COMPLETED;

        for (const chunk of chunkText(content)) {
          yield { event: 'content_delta', data: { text: chunk } };
        }
        yield {
          event: 'error',
          data: {
            code: 'AI_TOOL_NOT_ALLOWED',
            detail:
              normalizeCopilotLocale(input.locale) === 'en'
                ? 'The requested action is not available for candidate accounts.'
                : 'Thao tác được yêu cầu không khả dụng với tài khoản ứng viên.',
            status: 'permission_denied',
          },
        };
        yield { event: 'suggestions', data: { suggestions } };
        return;
      }

      if (effectivePlan.toolCalls.length > 0 && outcomes.length === 0) {
        throw new Error('AI_TOOL_FAILED');
      }

      // General candidate guidance is the only v1 path that reads the shared,
      // reviewed knowledge corpus. CV, application and job facts remain in
      // their already-authorised domain tools; they never enter shared RAG.
      const knowledgeResults =
        effectivePlan.intent === 'GENERAL_GUIDANCE'
          ? await this.knowledge.search({
              candidateProfileId: input.candidateProfileId,
              conversationId: input.conversationId,
              query: input.prompt,
              locale: normalizeCopilotLocale(input.locale),
            })
          : [];
      if (knowledgeResults.length) {
        outcomes.push({
          call: {
            id: randomUUID(),
            name: 'candidate_knowledge',
            label:
              normalizeCopilotLocale(input.locale) === 'en'
                ? 'Reading UpNext guidance'
                : 'Đọc hướng dẫn UpNext',
            status: 'succeeded',
          },
          data: knowledgeResults,
        });
      }

      /* ---------------- Bước 3: dẫn chứng và thẻ, do backend tính ---------------- */

      const derived = await this.deriveCardsAndCitations(
        input.candidateProfileId,
        outcomes,
        input.locale,
      );
      citations.push(...derived.citations);
      citations.push(...this.knowledgeCitations(knowledgeResults, citations.length + 1));

      /* ---------------- Bước 4: stream câu trả lời ---------------- */

      yield { event: 'status', data: { step: 'streaming' } };

      const dataBlock = this.buildDataBlock(outcomes, derived.citations, input.locale);

      for await (const chunk of this.llm.streamText({
        systemInstruction: candidateAnswerPrompt(input.locale),
        messages: [
          ...history.map((turn) => ({
            role: turn.role === 'USER' ? ('user' as const) : ('model' as const),
            text: turn.content,
          })),
          { role: 'user' as const, text: `${input.prompt}\n\n${dataBlock}` },
        ],
        maxOutputTokens: ANSWER_MAX_OUTPUT_TOKENS,
        ...(input.signal ? { signal: input.signal } : {}),
      })) {
        if (chunk.kind === 'usage') {
          inputTokens += chunk.inputTokens;
          outputTokens += chunk.outputTokens;
          modelName = chunk.modelName;
          continue;
        }
        content += chunk.text;
        yield { event: 'content_delta', data: { text: chunk.text } };
      }

      for (const citation of citations) {
        yield { event: 'citation', data: { citation } };
      }
      for (const card of derived.cards) {
        cards.push(card);
        yield { event: 'card', data: { card } };
      }

      /**
       * Đề xuất hành động — chỉ khi ứng viên đang xem đúng MỘT tin cụ thể và
       * chưa lưu nó.
       *
       * Điều kiện hẹp có chủ đích. Đề xuất kèm mọi câu trả lời sẽ thành nhiễu, và
       * một nút ghi dữ liệu xuất hiện khi người dùng không hỏi tới nó là cách
       * nhanh nhất làm họ mất tin vào việc "AI không tự sửa gì".
       */
      const proposal = await this.maybeProposeSaveJob(input, assistant.id, derived.jobsInScope);
      if (proposal) {
        yield { event: 'action_request', data: { actionRequest: proposal } };
      }

      suggestions = derived.suggestions;
      if (suggestions.length) {
        yield { event: 'suggestions', data: { suggestions } };
      }

      finalStatus = AiRunStatus.COMPLETED;
    } catch (error) {
      const mapped = this.mapError(error, input.locale);
      errorCode = mapped.code;
      // Có nội dung dở dang thì vẫn giữ lại cho người dùng đọc — §15.4 "partial".
      finalStatus = content ? AiRunStatus.PARTIAL : AiRunStatus.FAILED;

      yield {
        event: 'error',
        data: {
          code: mapped.code,
          detail: mapped.detail,
          status: content ? 'partial' : mapped.clientStatus,
        },
      };
    } finally {
      const latencyMs = Date.now() - startedAt;

      // Người dùng bấm "Dừng": không có lỗi, nhưng nội dung bị cắt.
      if (finalStatus === AiRunStatus.STREAMING) {
        finalStatus = content ? AiRunStatus.PARTIAL : AiRunStatus.FAILED;
      }

      await this.persist({
        input,
        assistantMessageId: assistant.id,
        traceId,
        content,
        intent,
        citations,
        cards,
        toolCalls,
        suggestions,
        inputTokens,
        outputTokens,
        modelName,
        latencyMs,
        blockedToolCount,
        errorCode,
        status: finalStatus,
      });

      if (finalStatus === AiRunStatus.COMPLETED) {
        yield {
          event: 'done',
          data: {
            messageId: assistant.id,
            meta: {
              model: modelName,
              promptVersion: CANDIDATE_ANSWER_PROMPT_VERSION,
              latencyMs,
              inputTokens,
              outputTokens,
            },
          },
        };
      }
    }
  }

  /**
   * Ngữ cảnh trang được đưa cho router dưới dạng dữ liệu có nhãn, không nối vào
   * câu hỏi — để model không nhầm nó là một phần yêu cầu của người dùng.
   */
  private routerUserMessage(input: CopilotRunInput): string {
    const english = normalizeCopilotLocale(input.locale) === 'en';
    const context =
      input.contextType === AiConversationContext.GENERAL || !input.contextId
        ? english
          ? 'The user is on a general page without a specific entity in context.'
          : 'Người dùng đang ở trang tổng quan, không có thực thể cụ thể.'
        : english
          ? `The user is viewing ${input.contextType} with id ${input.contextId}.`
          : `Người dùng đang xem ${input.contextType} với id ${input.contextId}.`;
    return english
      ? `PAGE CONTEXT: ${context}\n\nQUESTION: ${input.prompt}`
      : `NGỮ CẢNH TRANG: ${context}\n\nCÂU HỎI: ${input.prompt}`;
  }

  /**
   * Tự điền id từ ngữ cảnh trang khi model không cung cấp.
   *
   * §16.1: "tool chỉ nhận UUID hợp lệ". Model không được bịa id, nên khi nó bỏ
   * trống mà tool cần id thì lấy từ ngữ cảnh trang đã được backend xác thực —
   * an toàn hơn là để model đoán.
   */
  private contextArgumentFor(toolName: string, input: CopilotRunInput): string | undefined {
    if (!input.contextId) return undefined;
    if (toolName === 'get_public_job' && input.contextType === AiConversationContext.JOB) {
      return input.contextId;
    }
    if (toolName === 'get_own_cv' && input.contextType === AiConversationContext.CV) {
      return input.contextId;
    }
    return undefined;
  }

  /**
   * Policy nghiệp vụ nằm ở backend, không phó mặc cho model.
   * Router vẫn chọn intent, nhưng intent cần dữ liệu thật luôn nhận đúng tool
   * tối thiểu; intent phụ thuộc một tin cụ thể phải có ngữ cảnh JOB hợp lệ.
   */
  private enforceBusinessPlan(plan: IntentPlan, input: CopilotRunInput): IntentPlan {
    const required: Record<Exclude<AiIntent, 'OUT_OF_SCOPE'>, string[]> = {
      GENERAL_GUIDANCE: [],
      CV_ANALYSIS: ['get_own_cv'],
      JOB_SEARCH: ['get_own_profile', 'search_matching_jobs'],
      JOB_COMPARISON: ['get_own_profile', 'get_own_cv', 'get_public_job'],
      APPLICATION_STATUS: ['get_own_applications'],
      MOCK_INTERVIEW:
        input.contextType === AiConversationContext.JOB
          ? ['get_own_profile', 'get_public_job']
          : ['get_own_profile'],
      SKILL_GAP: ['get_own_profile', 'get_public_job'],
    };

    if (plan.intent === 'OUT_OF_SCOPE') return plan;

    const inScopeIntent: Exclude<AiIntent, 'OUT_OF_SCOPE'> = plan.intent;

    if (
      (inScopeIntent === 'JOB_COMPARISON' || inScopeIntent === 'SKILL_GAP') &&
      (input.contextType !== AiConversationContext.JOB || !input.contextId)
    ) {
      throw new Error('AI_CONTEXT_NOT_FOUND');
    }

    const byName = new Map(plan.toolCalls.map((tool) => [tool.name, tool]));
    const approved = required[inScopeIntent].map((name) => ({
      name,
      argument: byName.get(name)?.argument ?? this.contextArgumentFor(name, input),
    }));

    // The model may classify intent, but it may not expand the data boundary.
    // Only the deterministic allowlist for that intent is executed. This keeps
    // a greeting/general question from reading profile data and prevents prompt
    // injection from smuggling an unrelated but otherwise candidate-safe tool.
    return { ...plan, toolCalls: approved.slice(0, MAX_TOOL_CALLS) };
  }

  /**
   * Sinh thẻ kết quả và dẫn chứng **từ dữ liệu tool**, không từ output của model.
   *
   * Đây là chỗ thực thi §11.1. Model không bao giờ được sinh ra con số điểm; nó
   * chỉ nhận điểm đã tính và viết phần giải thích.
   */
  private async deriveCardsAndCitations(
    candidateProfileId: string,
    outcomes: ToolOutcome[],
    locale: string,
  ): Promise<{
    cards: AiCard[];
    citations: AiCitation[];
    suggestions: string[];
    /** Tin được hỏi trực tiếp (không phải kết quả tìm kiếm) — dùng cho đề xuất lưu tin. */
    jobsInScope: JobPostContext[];
  }> {
    const cards: AiCard[] = [];
    const citations: AiCitation[] = [];
    const suggestions: string[] = [];
    const english = normalizeCopilotLocale(locale) === 'en';

    const profile = outcomes.find((outcome) => outcome.call.name === 'get_own_profile')?.data as
      | CandidateProfileContext
      | undefined;

    const jobLists = outcomes
      .filter((outcome) => outcome.call.name === 'search_matching_jobs')
      .flatMap((outcome) => outcome.data as JobPostContext[]);
    const singleJobs = outcomes
      .filter((outcome) => outcome.call.name === 'get_public_job')
      .map((outcome) => outcome.data as JobPostContext);

    const jobs = [...singleJobs, ...jobLists];

    // Cần hồ sơ mới chấm được độ phủ kỹ năng. Nếu router không gọi
    // get_own_profile thì lấy thêm — thẻ không có điểm thì vô dụng.
    const resolvedProfile =
      jobs.length && !profile ? await this.context.profile(candidateProfileId) : profile;

    let citationIndex = 1;

    for (const job of jobs.slice(0, 3)) {
      if (resolvedProfile) {
        const coverage = computeSkillCoverage({
          candidateSkills: resolvedProfile.skills.map((skill) => ({
            name: skill.name,
            years: skill.years,
          })),
          requiredSkills: job.requiredSkills,
          niceToHaveSkills: job.niceToHaveSkills,
          candidateCity: resolvedProfile.city,
          jobCity: job.city,
          candidateWorkingModel: resolvedProfile.workingModel,
          jobWorkingModel: job.workingModel,
        });

        cards.push({
          type: 'job_match',
          jobId: job.jobPostId,
          title: job.title,
          companyName: job.companyName,
          location: job.city ?? (english ? 'Not specified' : 'Chưa rõ'),
          workingModel: job.workingModel ?? (english ? 'Not specified' : 'Chưa rõ'),
          ...(job.salaryLabel ? { salaryLabel: job.salaryLabel } : {}),
          totalScore: coverage.totalScore,
          confidenceScore: coverage.confidenceScore,
          ...(coverage.confidenceReason ? { confidenceReason: coverage.confidenceReason } : {}),
          breakdown: coverage.breakdown,
          matchedSkills: coverage.matchedSkills,
          missingSkills: coverage.missingSkills,
          toVerify: coverage.toVerify,
          algorithmVersion: coverage.algorithmVersion,
          href: `/jobs/${job.slug}`,
        });

        if (singleJobs.includes(job) && coverage.missingSkills.length) {
          cards.push({
            type: 'skill_gap',
            jobTitle: `${job.title} — ${job.companyName}`,
            gaps: coverage.missingSkills.slice(0, 10).map((skill) => ({
              skill,
              importance: 'required' as const,
              status: 'missing' as const,
              note: english
                ? 'Not found in the skills listed on your profile'
                : 'Không xuất hiện trong danh sách kỹ năng của hồ sơ',
            })),
            preparationQuestions: [],
          });
        }
      }

      if (job.requirements) {
        citations.push({
          id: randomUUID(),
          index: citationIndex,
          sourceType: 'JOB',
          sourceId: job.jobPostId,
          title: `${job.title} — ${job.companyName} · ${english ? 'Requirements' : 'Yêu cầu'}`,
          excerpt: job.requirements.slice(0, 400),
          href: `/jobs/${job.slug}`,
        });
        citationIndex += 1;
      }
    }

    for (const outcome of outcomes.filter((item) => item.call.name === 'get_own_applications')) {
      const applications = outcome.data as {
        applicationId: string;
        jobTitle: string;
        companyName: string;
        status: string;
        submittedAt: string;
      }[];

      for (const application of applications.slice(0, 3)) {
        cards.push({
          type: 'application_status',
          applicationId: application.applicationId,
          jobTitle: application.jobTitle,
          companyName: application.companyName,
          status: applicationStatusLabel(application.status, locale),
          statusTone: applicationStatusTone(application.status),
          appliedAt: formatDate(application.submittedAt, locale),
          timeline: buildTimeline(application.status, locale),
          href: `/candidate/applications/${application.applicationId}`,
        });
      }
    }

    for (const outcome of outcomes.filter((item) => item.call.name === 'get_own_cv')) {
      const cv = outcome.data as { cvVersionId: string; cvName: string; parsedText: string };

      /**
       * Thẻ phân tích CV — điểm do `computeCvQuality` tính, không do model sinh.
       * §8.1: "không trả text tự do làm kết quả chính".
       */
      const profileForCv = resolvedProfile ?? (await this.context.profile(candidateProfileId));
      const quality = computeCvQuality({
        parsedText: cv.parsedText,
        skillCount: profileForCv.skills.length,
        experienceCount: profileForCv.experiences.length,
        hasDesiredPosition: Boolean(profileForCv.desiredPosition),
      });

      cards.push({
        type: 'cv_analysis',
        cvVersionId: cv.cvVersionId,
        cvName: cv.cvName,
        overallScore: quality.overallScore,
        scores: quality.scores,
        strengths: quality.strengths,
        weaknesses: quality.weaknesses,
        missingSections: quality.missingSections,
        href: '/candidate/cv-builder',
      });

      if (cv.parsedText) {
        citations.push({
          id: randomUUID(),
          index: citationIndex,
          sourceType: 'CV',
          sourceId: cv.cvVersionId,
          title: cv.cvName,
          excerpt: cv.parsedText.slice(0, 400),
          href: '/candidate/cv-builder',
        });
        citationIndex += 1;
      }
      suggestions.push(
        english ? 'Compare my CV with a job post' : 'So sánh CV của tôi với một tin tuyển dụng',
      );
    }

    if (jobs.length) {
      suggestions.push(
        english
          ? 'Which skills am I missing for this role?'
          : 'Tôi còn thiếu kỹ năng gì cho vị trí này?',
      );
    }
    if (!suggestions.length) suggestions.push(...suggestionsFor(locale).slice(0, 2));

    return { cards, citations, suggestions: suggestions.slice(0, 3), jobsInScope: singleJobs };
  }

  private async maybeProposeSaveJob(
    input: CopilotRunInput,
    messageId: string,
    jobsInScope: JobPostContext[],
  ) {
    if (jobsInScope.length !== 1) return null;
    const job = jobsInScope[0];
    if (!job) return null;

    const alreadySaved = await this.context.isJobSaved(input.candidateProfileId, job.jobPostId);
    if (alreadySaved) return null;
    const english = normalizeCopilotLocale(input.locale) === 'en';

    return this.actions.propose({
      conversationId: input.conversationId,
      messageId,
      candidateProfileId: input.candidateProfileId,
      actionType: 'SAVE_JOB',
      payload: { jobPostId: job.jobPostId, slug: job.slug },
      display: {
        actionType: 'SAVE_JOB',
        title: english ? 'Save this job' : 'Lưu tin tuyển dụng này',
        description: english
          ? 'This job will be added to your saved jobs. No other profile information will change.'
          : 'Tin sẽ được thêm vào danh sách việc đã lưu của bạn. Không có gì khác trong hồ sơ bị thay đổi.',
        changes: [
          {
            label: english ? 'Saved job' : 'Việc đã lưu',
            to: `${job.title} — ${job.companyName}`,
          },
        ],
        confirmLabel: english ? 'Save job' : 'Lưu tin',
      },
    });
  }

  /**
   * Khối dữ liệu đưa cho model, có nhãn không đáng tin cậy.
   *
   * §16.1: không nối system prompt với document. Dữ liệu nghiệp vụ nằm trong
   * message của người dùng, bọc trong nhãn rõ ràng, và system prompt đã dặn model
   * coi mọi chỉ dẫn bên trong khối này là văn bản.
   */
  private buildDataBlock(outcomes: ToolOutcome[], citations: AiCitation[], locale: string): string {
    const english = normalizeCopilotLocale(locale) === 'en';
    const sections = outcomes.map(
      (outcome) =>
        `--- ${outcome.call.name} ---\n${JSON.stringify(outcome.data, null, 1).slice(0, 6_000)}`,
    );

    const citationList = citations.length
      ? `\n\n${english ? 'EVIDENCE (use these numbers when inserting [n])' : 'DẪN CHỨNG (dùng số này khi chèn [n])'}:\n${citations
          .map((citation) => `[${citation.index}] ${citation.title}`)
          .join('\n')}`
      : '';

    return `<<<UNTRUSTED_DOCUMENT
${english ? 'DATA' : 'DỮ LIỆU'}:
${sections.join('\n\n') || (english ? '(no data — answer only with safe, general platform guidance)' : '(không có dữ liệu — chỉ trả lời bằng hướng dẫn chung, an toàn về nền tảng)')}${citationList}
UNTRUSTED_DOCUMENT>>>`;
  }

  private knowledgeCitations(
    results: CandidateKnowledgeSearchResult[],
    startIndex: number,
  ): AiCitation[] {
    return results.map((result, index) => ({
      id: `knowledge:${result.chunkId}`,
      index: startIndex + index,
      sourceType: 'POLICY' as const,
      sourceId: result.documentId,
      title: result.title,
      excerpt: result.excerpt,
      ...(result.canonicalUrl ? { href: result.canonicalUrl } : {}),
    }));
  }

  private mapError(
    error: unknown,
    locale: string,
  ): {
    code: AiErrorCode;
    detail: string;
    clientStatus: 'rate_limited' | 'model_unavailable' | 'failed' | 'permission_denied' | 'partial';
  } {
    const message = error instanceof Error ? error.message : '';
    const english = normalizeCopilotLocale(locale) === 'en';

    if (message === 'AI_MODEL_RATE_LIMIT') {
      return {
        code: 'AI_MODEL_RATE_LIMIT',
        detail: english
          ? 'The AI service is busy right now. Please try again in a few minutes.'
          : 'Dịch vụ AI đang quá tải. Bạn thử lại sau ít phút nhé.',
        clientStatus: 'rate_limited',
      };
    }
    if (message === 'AI_INVALID_OUTPUT') {
      return {
        code: 'AI_INVALID_OUTPUT',
        detail: english
          ? 'I could not finish that answer reliably. Please try again or make the question more specific.'
          : 'Mình chưa thể hoàn thiện câu trả lời này một cách đáng tin cậy. Bạn hãy thử lại hoặc hỏi cụ thể hơn nhé.',
        clientStatus: 'failed',
      };
    }
    if (message === 'AI_CONTENT_BLOCKED') {
      return {
        code: 'AI_INVALID_OUTPUT',
        detail: english
          ? 'The request could not be completed safely. Try rephrasing it without sensitive content.'
          : 'Yêu cầu chưa thể xử lý an toàn. Bạn hãy diễn đạt lại và tránh đưa thông tin nhạy cảm nhé.',
        clientStatus: 'failed',
      };
    }
    if (message === 'AI_MODEL_TIMEOUT' || (error instanceof Error && error.name === 'AbortError')) {
      return {
        code: 'AI_MODEL_TIMEOUT',
        detail: english
          ? 'This is taking longer than expected. Please try again with a shorter question.'
          : 'Yêu cầu đang mất nhiều thời gian hơn dự kiến. Bạn hãy thử lại với câu hỏi ngắn gọn hơn nhé.',
        clientStatus: 'failed',
      };
    }
    if (message === 'AI_CONTEXT_NOT_FOUND') {
      return {
        code: 'AI_CONTEXT_NOT_FOUND',
        detail: english
          ? 'Open the job you want to compare, then ask this question again.'
          : 'Bạn hãy mở tin tuyển dụng muốn so sánh rồi hỏi lại để mình dùng đúng dữ liệu nhé.',
        clientStatus: 'failed',
      };
    }
    if (message === 'AI_TOOL_FAILED') {
      return {
        code: 'AI_TOOL_FAILED',
        detail: english
          ? 'I could not retrieve the account data needed for this answer. Your data was not changed; please try again.'
          : 'Mình chưa lấy được dữ liệu cần thiết để trả lời. Dữ liệu của bạn không bị thay đổi; vui lòng thử lại nhé.',
        clientStatus: 'failed',
      };
    }

    this.logger.error(`Lỗi không lường trước trong Copilot: ${message}`);
    return {
      code: 'AI_SERVICE_UNAVAILABLE',
      detail: english
        ? 'The AI service is temporarily unavailable. Other UpNext features are still working normally.'
        : 'Dịch vụ AI đang tạm gián đoạn. Các chức năng khác của UpNext vẫn hoạt động bình thường.',
      clientStatus: 'model_unavailable',
    };
  }

  private async persist(args: {
    input: CopilotRunInput;
    assistantMessageId: string;
    traceId: string;
    content: string;
    intent: string | null;
    citations: AiCitation[];
    cards: AiCard[];
    toolCalls: AiToolCall[];
    suggestions: string[];
    inputTokens: number;
    outputTokens: number;
    modelName: string;
    latencyMs: number;
    blockedToolCount: number;
    errorCode: AiErrorCode | null;
    status: AiRunStatus;
  }) {
    try {
      await this.conversations.finalizeAssistantMessage({
        messageId: args.assistantMessageId,
        conversationId: args.input.conversationId,
        content: args.content,
        status: args.status,
        intent: args.intent,
        citations: args.citations,
        cards: args.cards,
        toolCalls: args.toolCalls,
        suggestions: args.suggestions,
        modelName: args.modelName,
        promptVersion: `${CANDIDATE_ROUTER_PROMPT_VERSION}+${CANDIDATE_ANSWER_PROMPT_VERSION}`,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        latencyMs: args.latencyMs,
        errorCode: args.errorCode,
      });

      await this.prisma.aIRun.create({
        data: {
          traceId: args.traceId,
          actorType: ActorType.CANDIDATE,
          actorId: args.input.candidateProfileId,
          feature: 'candidate_copilot_chat',
          intent: args.intent,
          modelName: args.modelName,
          promptVersion: `${CANDIDATE_ROUTER_PROMPT_VERSION}+${CANDIDATE_ANSWER_PROMPT_VERSION}`,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          latencyMs: args.latencyMs,
          toolCallCount: args.toolCalls.length,
          blockedToolCount: args.blockedToolCount,
          status: args.status,
          errorCode: args.errorCode,
        },
      });

      // `AIRun` above covers latency/tool-call telemetry but has no
      // `costEstimate`/`companyId` -- doesn't serve the COGS-per-feature purpose
      // `AiUsageLog` exists for (D3c, KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 20).
      // A candidate run never has a companyId, unlike the recruiter-side features.
      await this.prisma.aiUsageLog.create({
        data: {
          feature: SubscriptionFeature.AI_COPILOT_RUN,
          companyId: null,
          actorType: ActorType.CANDIDATE,
          actorId: args.input.candidateProfileId,
          modelName: args.modelName,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          costEstimate: args.modelName.startsWith('gemini-')
            ? estimateGeminiCostVnd(args.inputTokens, args.outputTokens)
            : null,
          referenceType: 'AI_COPILOT_RUN',
          referenceId: args.traceId,
          succeeded: args.status === AiRunStatus.COMPLETED || args.status === AiRunStatus.PARTIAL,
        },
      });
    } catch (error) {
      // Ghi log thất bại không được làm mất câu trả lời đã gửi cho người dùng.
      this.logger.error(
        `Không lưu được kết quả lượt chạy ${args.traceId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}

/** Cắt văn bản có sẵn thành chunk để câu trả lời canned cũng hiện dần như stream thật. */
function chunkText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function applicationStatusLabel(status: string, locale: string): string {
  const vi: Record<string, string> = {
    SUBMITTED: 'Đã nộp',
    VIEWED: 'Đã xem',
    SHORTLISTED: 'Vào danh sách ngắn',
    INTERVIEWING: 'Phỏng vấn',
    OFFERED: 'Đã đề nghị',
    HIRED: 'Đã nhận',
    REJECTED: 'Không phù hợp',
    WITHDRAWN: 'Đã rút',
  };
  const en: Record<string, string> = {
    SUBMITTED: 'Submitted',
    VIEWED: 'Viewed',
    SHORTLISTED: 'Shortlisted',
    INTERVIEWING: 'Interviewing',
    OFFERED: 'Offer received',
    HIRED: 'Hired',
    REJECTED: 'Not selected',
    WITHDRAWN: 'Withdrawn',
  };
  return (normalizeCopilotLocale(locale) === 'en' ? en : vi)[status] ?? status;
}

function applicationStatusTone(
  status: string,
): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  if (status === 'HIRED' || status === 'OFFERED') return 'success';
  if (status === 'REJECTED') return 'error';
  if (status === 'WITHDRAWN') return 'neutral';
  if (status === 'INTERVIEWING' || status === 'SHORTLISTED') return 'info';
  return 'neutral';
}

/** Các mốc của một đơn ứng tuyển, đánh dấu mốc hiện tại theo status. */
function buildTimeline(
  status: string,
  locale: string,
): { label: string; at: string; state: 'done' | 'current' | 'upcoming' }[] {
  const stages = ['SUBMITTED', 'VIEWED', 'INTERVIEWING', 'HIRED'];
  const labels =
    normalizeCopilotLocale(locale) === 'en'
      ? ['Submitted', 'Viewed', 'Interview', 'Decision']
      : ['Đã nộp', 'Đã xem', 'Phỏng vấn', 'Kết quả'];
  // REJECTED/WITHDRAWN không nằm trên trục tiến trình — coi như dừng ở mốc cuối đã qua.
  const currentIndex = stages.indexOf(status);
  const resolvedIndex = currentIndex === -1 ? (status === 'SHORTLISTED' ? 1 : 0) : currentIndex;

  return stages.map((_stage, index) => ({
    label: labels[index] ?? '',
    at: '—',
    state: index < resolvedIndex ? 'done' : index === resolvedIndex ? 'current' : 'upcoming',
  }));
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(normalizeCopilotLocale(locale) === 'en' ? 'en-GB' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}
