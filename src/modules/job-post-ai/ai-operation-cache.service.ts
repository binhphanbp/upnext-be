import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bao lâu một kết quả còn dùng lại được cho retry. Đủ dài để phục vụ mọi lần thử
 * lại hợp lý của client, đủ ngắn để bảng không thành nơi lưu trữ lâu dài -- payload
 * ở đây là dữ liệu tạm, bản nháp thật thuộc về `job_posts`.
 */
const RESULT_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * Sau bao lâu thì coi lần gọi trước là đã CHẾT thay vì đang chạy.
 *
 * Cần con số này để phân biệt hai tình huống mà từ phía server trông giống nhau:
 * đã tiêu quota nhưng chưa có kết quả cache. Có thể là (a) một request song song
 * đang gọi model -- bấm hai lần, hoặc (b) lần trước đã chết giữa đường. Trả 409
 * mãi mãi cho (b) thì người dùng mất lượt đã trả; gọi lại model ngay cho (a) thì
 * mất đúng số tiền mà cả bảng này sinh ra để tiết kiệm.
 */
const IN_FLIGHT_GRACE_MS = 60 * 1_000;

@Injectable()
export class AiOperationCacheService {
  private readonly logger = new Logger(AiOperationCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Kết quả còn hiệu lực của key này, hoặc null nếu chưa có / đã hết hạn. */
  async read<T>(idempotencyKey: string): Promise<T | null> {
    const row = await this.prisma.aiOperationResult.findUnique({ where: { idempotencyKey } });
    if (!row) return null;

    // Hết hạn thì coi như chưa có: gọi lại model còn tốt hơn trả kết quả cũ mà
    // người dùng đã không còn chờ nữa.
    if (row.expiresAt <= new Date()) return null;

    return row.payload as T;
  }

  async write(idempotencyKey: string, operation: string, payload: unknown): Promise<void> {
    const now = new Date();
    const data = {
      operation,
      payload: payload as Prisma.InputJsonValue,
      expiresAt: new Date(now.getTime() + RESULT_TTL_MS),
    };

    await this.prisma.aiOperationResult.upsert({
      where: { idempotencyKey },
      update: data,
      create: { idempotencyKey, ...data },
    });

    // Dọn kiểu cơ hội. Không có cron nền nào cho việc này, và bảng sẽ phình vô hạn
    // nếu không ai dọn; `expires_at` có index nên câu này rẻ. Lỗi ở đây không được
    // làm hỏng request -- người dùng đã có kết quả rồi.
    await this.prisma.aiOperationResult
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .catch((error: unknown) => {
        this.logger.warn(`Không dọn được kết quả AI hết hạn: ${String(error)}`);
      });
  }

  /**
   * Lần gọi trước có còn được coi là đang chạy hay không.
   *
   * Dùng khi quota đã bị tiêu cho key này (`replayed: true`) mà cache lại trống.
   */
  isStillInFlight(consumedAt: Date, now = new Date()): boolean {
    return now.getTime() - consumedAt.getTime() < IN_FLIGHT_GRACE_MS;
  }
}
