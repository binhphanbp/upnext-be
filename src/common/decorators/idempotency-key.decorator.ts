import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Đọc header `Idempotency-Key` và bắt buộc nó là một UUID.
 *
 * `AI_TALENT_DISCOVERY_ROLLOUT_PLAN.md` §9 đặc tả idempotency của Discovery ở
 * **header**, khác với quy ước hiện hành trong repo là một field trong body
 * (`clientRequestId` của `CreateTalentContactDto`, `clientMessageId` của
 * `SendMessageDto`).
 *
 * Vì sao là param decorator chứ không phải interceptor toàn cục: một
 * interceptor *đúng* phải phát lại **response của lần gọi đầu tiên** cho một
 * key lặp lại. Điều đó cần một bảng cache response, một chính sách TTL, và một
 * quyết định về việc phải làm gì khi lần gọi đầu còn đang bay — tức một bảng
 * mới và một chế độ lỗi mới. Repo này đã có idempotency ở đúng nơi cần nó:
 * `SubscriptionUsage.idempotencyKey @unique`, thứ duy nhất nguyên tử cùng với
 * việc trừ quota. Chỉ vài endpoint cần header, và param tường minh giữ giá trị
 * đó hiện diện ngay chỗ nó được ghép vào quota key.
 *
 * **Key phải được scope theo company** ở nơi dùng:
 * `talent-discovery:${companyId}:${key}`. Không scope thì một key trùng nhau
 * giữa hai tenant sẽ gây replay chéo công ty.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = request.headers['idempotency-key'];
    // Một header lặp lại tới đây dưới dạng mảng. Ghép lại rồi từ chối thì tốt
    // hơn là lặng lẽ lấy phần tử đầu — hai key khác nhau trong một request là
    // lỗi của client, không phải thứ để đoán.
    const value = (Array.isArray(raw) ? raw.join(',') : raw)?.trim();

    if (!value) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Thiếu header Idempotency-Key.',
      });
    }
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Header Idempotency-Key phải là một UUID.',
      });
    }
    return value.toLowerCase();
  },
);
