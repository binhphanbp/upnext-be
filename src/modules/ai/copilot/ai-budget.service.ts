import { ConflictException, Injectable } from '@nestjs/common';
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
 * Hạn mức chạy AI theo ngày cho mỗi ứng viên.
 *
 * `ai_runs` đã ghi `inputTokens`/`outputTokens` và có sẵn
 * `@@index([actorId, createdAt])` từ ngày module này được tạo — nhưng không có
 * chỗ nào đọc lại để chặn. Mã lỗi `AI_BUDGET_EXCEEDED` cũng đã có trong contract
 * mà chưa từng được phát ra. Service này là phần còn thiếu: đọc-và-chặn.
 *
 * Kiểm tra chạy **trước** lời gọi Gemini đầu tiên của lượt mới, không phải sau —
 * nếu không, request thứ 51 vẫn kịp gọi model xong mới bị từ chối, và mục đích
 * giới hạn chi phí coi như vô nghĩa.
 */
@Injectable()
export class AiBudgetService {
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
      throw new ConflictException({
        code: 'AI_BUDGET_EXCEEDED',
        message: 'Đã đạt hạn mức sử dụng AI Copilot hôm nay. Hạn mức làm mới vào 0h.',
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
