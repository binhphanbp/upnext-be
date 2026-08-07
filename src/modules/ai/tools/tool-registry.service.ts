import { Injectable, Logger } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { CandidateContextAssembler } from '../context/candidate-context.assembler';

/**
 * Registry công cụ, phân quyền theo vai trò.
 *
 * KE-HOACH-AI-REVIEW.md §7.2 và §16.3: registry **chỉ đăng ký những tool phù hợp
 * với role hiện tại**. Đây là điểm khác biệt so với cách làm phổ biến là đưa hết
 * tool vào rồi kiểm quyền trong từng tool — cách đó để lộ *tên* tool cho model,
 * và một model bị prompt injection sẽ biết chính xác cái gì đáng thử.
 *
 * Mô hình ở đây: model chỉ nhìn thấy danh sách của role mình. Nếu nó gọi tên
 * ngoài danh sách, `execute()` trả `blocked` và orchestrator ghi vào
 * `ai_runs.blocked_tool_count`. Đó là tín hiệu bảo mật đo được, không phải lỗi
 * vận hành — và là bằng chứng cho Demo 3 ở §29.
 */

export type ToolExecutionInput = {
  actorType: ActorType;
  /** candidateProfileId với vai trò ứng viên. */
  ownerId: string;
  /** Tham số duy nhất, thường là UUID hoặc slug lấy từ ngữ cảnh trang. */
  argument?: string | undefined;
};

export type ToolExecutionResult =
  | { status: 'succeeded'; label: string; detail: string; data: unknown }
  | { status: 'failed'; label: string; detail: string }
  | { status: 'blocked'; label: string; detail: string };

type ToolDefinition = {
  name: string;
  /** Mô tả cho model — ngắn, nói rõ *khi nào* dùng. */
  purpose: string;
  /** Nhãn tiếng Việt hiện trên timeline của UI. */
  label: string;
  run: (input: ToolExecutionInput) => Promise<{ detail: string; data: unknown }>;
};

/**
 * Timeout Gemini (15s/20s ở `gemini-llm.adapter.ts`) chỉ bọc lời gọi model —
 * truy vấn DB của tool không có trần nào. Tối đa 3 tool/lượt (`MAX_TOOL_CALLS`
 * ở `ai-copilot.service.ts`) nghĩa là một truy vấn treo có thể cộng dồn rất lâu
 * trước khi client nhận ra. 5 giây đủ rộng cho một truy vấn Prisma bình thường,
 * đủ hẹp để không giữ kết nối SSE vô thời hạn.
 */
const TOOL_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool "${label}" vượt quá thời gian cho phép`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Tool của recruiter/admin — **chưa hiện thực**, nhưng có tên ở đây.
 *
 * Có chủ đích: khi vai trò ứng viên cố gọi một trong những tên này, hệ thống
 * phân biệt được "tool thuộc role khác" (chặn có ghi log, trả lời rõ ràng) với
 * "tên tool không tồn tại" (model bịa ra). Hai thứ này cần phản ứng khác nhau.
 */
const OTHER_ROLE_TOOL_NAMES = new Set([
  'search_visible_candidates',
  'get_visible_candidate',
  'analyze_company_job',
  'generate_interview_kit',
  'draft_candidate_message',
  'get_company_pipeline_metrics',
  'get_report_case',
  'get_moderation_context',
  'summarize_audit_history',
]);

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(private readonly context: CandidateContextAssembler) {}

  /** Danh sách tool model được thấy. Không bao giờ trả tool của role khác. */
  listFor(actorType: ActorType): { name: string; purpose: string }[] {
    return this.definitionsFor(actorType).map((tool) => ({
      name: tool.name,
      purpose: tool.purpose,
    }));
  }

  async execute(name: string, input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const definition = this.definitionsFor(input.actorType).find((tool) => tool.name === name);

    if (!definition) {
      const isOtherRole = OTHER_ROLE_TOOL_NAMES.has(name);
      this.logger.warn(
        isOtherRole
          ? `CHẶN: vai trò ${input.actorType} cố gọi tool của role khác "${name}"`
          : `CHẶN: tool không tồn tại "${name}" (vai trò ${input.actorType})`,
      );
      return {
        status: 'blocked',
        label: 'Kiểm tra quyền công cụ',
        detail: isOtherRole
          ? `${name} không thuộc quyền của vai trò này`
          : `${name} không phải công cụ hợp lệ`,
      };
    }

    try {
      const { detail, data } = await withTimeout(
        definition.run(input),
        TOOL_TIMEOUT_MS,
        definition.name,
      );
      return { status: 'succeeded', label: definition.label, detail, data };
    } catch (error) {
      // Tool lỗi không được làm sập cả lượt trả lời — model vẫn trả lời được
      // với những dữ liệu đã lấy xong, và UI hiện tool đó là failed.
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      this.logger.warn(`Tool "${name}" thất bại: ${message}`);
      return { status: 'failed', label: definition.label, detail: message.slice(0, 200) };
    }
  }

  private definitionsFor(actorType: ActorType): ToolDefinition[] {
    return actorType === ActorType.CANDIDATE ? this.candidateTools() : [];
  }

  /** §7.2 — bộ tool của vai trò ứng viên. Tất cả chỉ đọc dữ liệu của chính họ. */
  private candidateTools(): ToolDefinition[] {
    return [
      {
        name: 'get_own_profile',
        purpose: 'Đọc hồ sơ, kỹ năng, kinh nghiệm và nguyện vọng của chính người dùng',
        label: 'Đọc hồ sơ của bạn',
        run: async ({ ownerId }) => {
          const profile = await this.context.profile(ownerId);
          return {
            detail: `${profile.desiredPosition ?? 'Chưa đặt vị trí mong muốn'} · ${profile.skills.length} kỹ năng`,
            data: profile,
          };
        },
      },
      {
        name: 'get_own_cv',
        purpose: 'Đọc nội dung CV của chính người dùng. argument là cvVersionId nếu cần bản cụ thể',
        label: 'Đọc CV của bạn',
        run: async ({ ownerId, argument }) => {
          const cv = await this.context.cvVersion(ownerId, argument ?? null);
          return { detail: `${cv.cvName} (bản ${cv.versionNo})`, data: cv };
        },
      },
      {
        name: 'get_own_applications',
        purpose: 'Đọc danh sách đơn ứng tuyển và trạng thái của chính người dùng',
        label: 'Đọc đơn ứng tuyển của bạn',
        run: async ({ ownerId }) => {
          const applications = await this.context.applications(ownerId);
          return { detail: `${applications.length} đơn`, data: applications };
        },
      },
      {
        name: 'get_public_job',
        purpose:
          'Đọc một tin tuyển dụng đang mở. argument là jobPostId hoặc slug lấy từ ngữ cảnh trang',
        label: 'Đọc tin tuyển dụng',
        run: async ({ argument }) => {
          if (!argument) throw new Error('Thiếu id hoặc slug của tin tuyển dụng');
          const job = await this.context.jobPost(argument);
          return { detail: `${job.title} — ${job.companyName}`, data: job };
        },
      },
      {
        name: 'search_matching_jobs',
        purpose: 'Tìm các tin tuyển dụng đang mở khớp với kỹ năng và nguyện vọng của người dùng',
        label: 'Tìm việc phù hợp',
        run: async ({ ownerId }) => {
          const jobs = await this.context.candidateJobs(ownerId);
          return { detail: `${jobs.length} vị trí`, data: jobs };
        },
      },
    ];
  }
}
