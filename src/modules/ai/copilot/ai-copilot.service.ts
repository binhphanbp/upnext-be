import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActorType, AiConversationContext, AiRunStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AI_INTENTS,
  AiCard,
  AiCitation,
  AiErrorCode,
  AiStreamEvent,
  AiToolCall,
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
  CANDIDATE_ANSWER_PROMPT,
  CANDIDATE_ANSWER_PROMPT_VERSION,
  CANDIDATE_OUT_OF_SCOPE_ANSWER,
  CANDIDATE_ROUTER_PROMPT_VERSION,
  CANDIDATE_TOOL_DENIED_ANSWER,
  candidateRouterPrompt,
  routerResponseSchema,
} from '../prompts/candidate-copilot.prompts';
import { ToolRegistryService } from '../tools/tool-registry.service';
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
const OUT_OF_SCOPE_SUGGESTIONS = [
  'Phân tích CV của tôi',
  'Tìm việc phù hợp',
  'Kiểm tra trạng thái ứng tuyển',
];

export type CopilotRunInput = {
  conversationId: string;
  candidateProfileId: string;
  candidateAccountId: string;
  prompt: string;
  /** Ngữ cảnh trang (§8.3) — quyết định tool nào nhận được id nào. */
  contextType: AiConversationContext;
  contextId: string | null;
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
      const history = await this.conversations.recentTurns(input.conversationId);

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

      intent = plan.data.intent;
      yield { event: 'intent', data: { intent: plan.data.intent } };

      /* ---------------- Ngoài phạm vi: không gọi model lần hai ---------------- */

      if (plan.data.intent === 'OUT_OF_SCOPE') {
        content = CANDIDATE_OUT_OF_SCOPE_ANSWER;
        suggestions = OUT_OF_SCOPE_SUGGESTIONS;
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

      for (const requested of plan.data.toolCalls.slice(0, MAX_TOOL_CALLS)) {
        const call: AiToolCall = {
          id: randomUUID(),
          name: requested.name,
          label: 'Đang kiểm tra…',
          status: 'running',
        };
        const toolStartedAt = Date.now();

        const result = await this.tools.execute(requested.name, {
          actorType: ActorType.CANDIDATE,
          ownerId: input.candidateProfileId,
          argument: requested.argument ?? this.contextArgumentFor(requested.name, input),
        });

        call.label = result.label;
        call.status = result.status;
        call.detail = result.detail;
        call.durationMs = Date.now() - toolStartedAt;
        toolCalls.push(call);

        yield { event: 'tool_start', data: { tool: { ...call, status: 'running' } } };
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
        content = CANDIDATE_TOOL_DENIED_ANSWER;
        suggestions = OUT_OF_SCOPE_SUGGESTIONS;
        errorCode = 'AI_TOOL_NOT_ALLOWED';
        finalStatus = AiRunStatus.COMPLETED;

        for (const chunk of chunkText(content)) {
          yield { event: 'content_delta', data: { text: chunk } };
        }
        yield {
          event: 'error',
          data: {
            code: 'AI_TOOL_NOT_ALLOWED',
            detail: 'Công cụ được yêu cầu không thuộc quyền của vai trò ứng viên.',
            status: 'permission_denied',
          },
        };
        yield { event: 'suggestions', data: { suggestions } };
        return;
      }

      /* ---------------- Bước 3: dẫn chứng và thẻ, do backend tính ---------------- */

      const derived = await this.deriveCardsAndCitations(input.candidateProfileId, outcomes);
      citations.push(...derived.citations);

      /* ---------------- Bước 4: stream câu trả lời ---------------- */

      yield { event: 'status', data: { step: 'streaming' } };

      const dataBlock = this.buildDataBlock(outcomes, derived.citations);

      for await (const chunk of this.llm.streamText({
        systemInstruction: CANDIDATE_ANSWER_PROMPT,
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
      const mapped = this.mapError(error);
      errorCode = mapped.code;
      // Có nội dung dở dang thì vẫn giữ lại cho người dùng đọc — §15.4 "partial".
      finalStatus = content ? AiRunStatus.PARTIAL : AiRunStatus.FAILED;

      yield {
        event: 'error',
        data: { code: mapped.code, detail: mapped.detail, status: mapped.clientStatus },
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
              model: this.llm.modelName,
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
    const context =
      input.contextType === AiConversationContext.GENERAL || !input.contextId
        ? 'Người dùng đang ở trang tổng quan, không có thực thể cụ thể.'
        : `Người dùng đang xem ${input.contextType} với id ${input.contextId}.`;
    return `NGỮ CẢNH TRANG: ${context}\n\nCÂU HỎI: ${input.prompt}`;
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
   * Sinh thẻ kết quả và dẫn chứng **từ dữ liệu tool**, không từ output của model.
   *
   * Đây là chỗ thực thi §11.1. Model không bao giờ được sinh ra con số điểm; nó
   * chỉ nhận điểm đã tính và viết phần giải thích.
   */
  private async deriveCardsAndCitations(
    candidateProfileId: string,
    outcomes: ToolOutcome[],
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
          location: job.city ?? 'Chưa rõ',
          workingModel: job.workingModel ?? 'Chưa rõ',
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
              note: 'Không xuất hiện trong danh sách kỹ năng của hồ sơ',
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
          title: `${job.title} — ${job.companyName} · Yêu cầu`,
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
          status: applicationStatusLabel(application.status),
          statusTone: applicationStatusTone(application.status),
          appliedAt: formatDate(application.submittedAt),
          timeline: buildTimeline(application.status),
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
      suggestions.push('So sánh CV của tôi với một tin tuyển dụng');
    }

    if (jobs.length) suggestions.push('Tôi còn thiếu kỹ năng gì cho vị trí này?');
    if (!suggestions.length) suggestions.push('Phân tích CV của tôi', 'Tìm việc phù hợp');

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

    return this.actions.propose({
      conversationId: input.conversationId,
      messageId,
      candidateProfileId: input.candidateProfileId,
      actionType: 'SAVE_JOB',
      payload: { jobPostId: job.jobPostId, slug: job.slug },
      display: {
        actionType: 'SAVE_JOB',
        title: 'Lưu tin tuyển dụng này',
        description:
          'Tin sẽ được thêm vào danh sách việc đã lưu của bạn. Không có gì khác trong hồ sơ bị thay đổi.',
        changes: [{ label: 'Việc đã lưu', to: `${job.title} — ${job.companyName}` }],
        confirmLabel: 'Lưu tin',
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
  private buildDataBlock(outcomes: ToolOutcome[], citations: AiCitation[]): string {
    const sections = outcomes.map(
      (outcome) =>
        `--- ${outcome.call.name} ---\n${JSON.stringify(outcome.data, null, 1).slice(0, 6_000)}`,
    );

    const citationList = citations.length
      ? `\n\nDẪN CHỨNG (dùng số này khi chèn [n]):\n${citations
          .map((citation) => `[${citation.index}] ${citation.title}`)
          .join('\n')}`
      : '';

    return `<<<UNTRUSTED_DOCUMENT
DỮ LIỆU:
${sections.join('\n\n') || '(không có dữ liệu — trả lời dựa trên hiểu biết chung về nền tảng)'}${citationList}
UNTRUSTED_DOCUMENT>>>`;
  }

  private mapError(error: unknown): {
    code: AiErrorCode;
    detail: string;
    clientStatus: 'rate_limited' | 'model_unavailable' | 'failed' | 'permission_denied' | 'partial';
  } {
    const message = error instanceof Error ? error.message : '';

    if (message === 'AI_MODEL_RATE_LIMIT') {
      return {
        code: 'AI_MODEL_RATE_LIMIT',
        detail: 'Dịch vụ AI đang quá tải. Bạn thử lại sau ít phút nhé.',
        clientStatus: 'rate_limited',
      };
    }
    if (message === 'AI_INVALID_OUTPUT') {
      return {
        code: 'AI_INVALID_OUTPUT',
        detail: 'Kết quả trả về không đúng định dạng mong đợi. Bạn thử hỏi lại nhé.',
        clientStatus: 'failed',
      };
    }
    if (message === 'AI_CONTENT_BLOCKED') {
      return {
        code: 'AI_INVALID_OUTPUT',
        detail: 'Nội dung bị bộ lọc an toàn của nhà cung cấp chặn.',
        clientStatus: 'failed',
      };
    }
    if (message.includes('timeout') || (error instanceof Error && error.name === 'AbortError')) {
      return {
        code: 'AI_MODEL_TIMEOUT',
        detail: 'Yêu cầu vượt quá thời gian cho phép. Kết quả có thể chưa đầy đủ.',
        clientStatus: 'partial',
      };
    }

    this.logger.error(`Lỗi không lường trước trong Copilot: ${message}`);
    return {
      code: 'AI_SERVICE_UNAVAILABLE',
      detail:
        'Không kết nối được tới dịch vụ AI. Các chức năng khác của UpNext vẫn hoạt động bình thường.',
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
        modelName: this.llm.modelName,
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
          modelName: this.llm.modelName,
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

function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SUBMITTED: 'Đã nộp',
    VIEWED: 'Đã xem',
    SHORTLISTED: 'Vào danh sách ngắn',
    INTERVIEWING: 'Phỏng vấn',
    OFFERED: 'Đã đề nghị',
    HIRED: 'Đã nhận',
    REJECTED: 'Không phù hợp',
    WITHDRAWN: 'Đã rút',
  };
  return labels[status] ?? status;
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
): { label: string; at: string; state: 'done' | 'current' | 'upcoming' }[] {
  const stages = ['SUBMITTED', 'VIEWED', 'INTERVIEWING', 'HIRED'];
  const labels = ['Đã nộp', 'Đã xem', 'Phỏng vấn', 'Kết quả'];
  // REJECTED/WITHDRAWN không nằm trên trục tiến trình — coi như dừng ở mốc cuối đã qua.
  const currentIndex = stages.indexOf(status);
  const resolvedIndex = currentIndex === -1 ? (status === 'SHORTLISTED' ? 1 : 0) : currentIndex;

  return stages.map((_stage, index) => ({
    label: labels[index] ?? '',
    at: '—',
    state: index < resolvedIndex ? 'done' : index === resolvedIndex ? 'current' : 'upcoming',
  }));
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
