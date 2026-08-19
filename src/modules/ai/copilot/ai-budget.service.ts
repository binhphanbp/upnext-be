import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * `tool-registry.service.ts` đã ghi rõ: một lượt gọi tool ngoài quyền không
 * phải lỗi vận hành mà là "tín hiệu bảo mật đo được", và orchestrator đã đếm nó
 * vào `ai_runs.blocked_tool_count` từ đầu. Nhưng không có gì đọc lại con số đó
 * để hành động — người dò tìm tool của vai trò khác chỉ tạo ra log `warn` vô
 * tận. Ngưỡng này là hành động còn thiếu.
 */
const MAX_BLOCKED_TOOL_ATTEMPTS_PER_DAY = 20;

/**
 * Cầu dao chi phí AI theo ngày — **không phải** hạn mức thương mại.
 *
 * `ai_runs` đã ghi `inputTokens`/`outputTokens` và có sẵn
 * `@@index([actorId, createdAt])` từ ngày module này được tạo — nhưng không có
 * chỗ nào đọc lại để chặn. Service này là phần còn thiếu: đọc-và-chặn.
 *
 * Kiểm tra chạy **trước** lời gọi Gemini đầu tiên của lượt mới, không phải sau —
 * nếu không, request vẫn kịp gọi model xong mới bị từ chối, và mục đích giới hạn
 * chi phí coi như vô nghĩa.
 *
 * ## Vì sao đây là cầu dao, không phải hạn mức
 *
 * Hạn mức nhìn thấy được của người dùng là **quota của gói** (`AI_COPILOT_RUN`
 * trong `plan_features`), tiêu qua `CandidateSubscriptionQuotaService`. Nếu
 * ngưỡng ở đây thấp hơn quota gói cao nhất thì người đã trả tiền sẽ bị chặn bởi
 * một giới hạn thứ hai mà bảng giá không hề nói tới — và không ai giải thích được
 * vì sao "còn 40 lượt" mà vẫn không chạy được.
 *
 * Vì vậy hai ngưỡng ở đây **phải luôn cao hơn hạn mức mỗi chu kỳ của gói cao
 * nhất** (xem `AI_MAX_RUNS_PER_DAY` trong `env.validation.ts`). Khi chúng nhảy,
 * đó là **sự cố kỹ thuật** — vòng lặp hỏng, token bị đánh cắp, hoặc một
 * `plan_features` bị cấu hình `limitValue = null` ngoài ý muốn — nên nó báo lỗi
 * hệ thống và ghi log mức `error` cho vận hành, chứ không hiện như "bạn đã hết
 * lượt".
 *
 * Không cần hoàn quota ở đây: cầu dao chạy **trước** khi quota được trừ, nên khi
 * nó nhảy thì chưa có lượt nào bị tiêu.
 */
@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async assertWithinDailyBudget(actorId: string): Promise<void> {
    const maxRuns = this.config.get<number>('aiMaxRunsPerDay')!;
    const maxTokens = this.config.get<number>('aiMaxTokensPerDay')!;

    const usage = await this.prisma.aIRun.aggregate({
      where: { actorId, createdAt: { gte: startOfToday() } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });

    const runCount = usage._count._all;
    const tokenCount = (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0);

    if (runCount >= maxRuns || tokenCount >= maxTokens) {
      // Mức `error` là có chủ đích: cầu dao nhảy nghĩa là có thứ cần người xem, chứ
      // không phải một người dùng bình thường đụng trần gói của họ.
      this.logger.error(
        `AI cost circuit breaker tripped for actor ${actorId}: ` +
          `${runCount}/${maxRuns} runs, ${tokenCount}/${maxTokens} tokens today. ` +
          `Plan quota is the user-facing limit; this threshold should sit above it.`,
      );
      throw new ServiceUnavailableException({
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'Trợ lý AI đang tạm thời không khả dụng. Vui lòng thử lại sau.',
      });
    }
  }

  async assertBelowBlockedToolThreshold(actorId: string): Promise<void> {
    const usage = await this.prisma.aIRun.aggregate({
      where: { actorId, createdAt: { gte: startOfToday() } },
      _sum: { blockedToolCount: true },
    });

    if ((usage._sum.blockedToolCount ?? 0) >= MAX_BLOCKED_TOOL_ATTEMPTS_PER_DAY) {
      throw new ConflictException({
        code: 'AI_TOOL_NOT_ALLOWED',
        message: 'Tài khoản này đã vượt ngưỡng thử gọi công cụ ngoài quyền trong hôm nay.',
      });
    }
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
