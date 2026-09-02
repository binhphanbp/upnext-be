import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Prisma, PrismaClient } from '@prisma/client';
import { redact } from '../ai/context/pii-redactor';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DOMAIN_AUDIT_METADATA_KEYS,
  DomainAuditAggregateType,
  DomainAuditEventType,
} from './domain-audit.events';

type AuditClient = Prisma.TransactionClient | PrismaClient;

/** Độ dài tối đa của một giá trị chuỗi trong metadata. */
const MAX_STRING_LENGTH = 200;
/** Số phần tử tối đa của một mảng trong metadata (ví dụ `ruleIds`). */
const MAX_ARRAY_LENGTH = 20;

export type DomainAuditInput = {
  eventType: DomainAuditEventType;
  aggregateType: DomainAuditAggregateType;
  aggregateId: string;
  actorType?: ActorType | null;
  actorId?: string | null;
  companyId?: string | null;
  candidateProfileId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Ghi nhật ký hành động cấp nghiệp vụ.
 *
 * `record()` nhận một `Prisma.TransactionClient` theo đúng khuôn của
 * `OutboxService.enqueue(params, client)`, để audit **commit nguyên tử cùng
 * hành động nó mô tả**. Ghi audit ngoài transaction sẽ tạo ra hai lớp sai lệch
 * mà không cách nào phân biệt sau này: hành động thành công nhưng audit mất, và
 * audit tồn tại cho một hành động đã rollback.
 *
 * Vì sao không dùng `AdminAuditLog`: `admin_id` của nó có FK cứng tới
 * `admin_users` (`schema.prisma`), nên chèn id của recruiter hay candidate sẽ
 * fail. Ba call site hiện tại của nó đều là luồng support của admin.
 */
@Injectable()
export class DomainAuditService {
  private readonly logger = new Logger(DomainAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: DomainAuditInput, client: AuditClient = this.prisma) {
    return client.domainAuditEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorType: input.actorType ?? null,
        actorId: input.actorId ?? null,
        companyId: input.companyId ?? null,
        candidateProfileId: input.candidateProfileId ?? null,
        metadata: this.sanitizeMetadata(input.eventType, input.metadata),
      },
      select: { id: true, eventType: true, createdAt: true },
    });
  }

  /**
   * Ghi audit mà một lỗi ghi không làm hỏng hành động chính.
   *
   * Chỉ dùng cho event **quan sát** (`RECOMMENDATION_VIEWED`,
   * `ANONYMOUS_PROFILE_VIEWED`) nằm ngoài transaction. Với event chứng minh một
   * quyết định (consent, contact, exposure cap) thì phải dùng `record()` trong
   * transaction — mất một bản ghi ở đó là mất bằng chứng.
   */
  async recordSafely(input: DomainAuditInput, client: AuditClient = this.prisma) {
    try {
      return await this.record(input, client);
    } catch (error) {
      this.logger.error(`Không ghi được audit event ${input.eventType}`, error);
      return null;
    }
  }

  /**
   * Giữ lại đúng những khoá đã được khai báo cho loại event, rồi làm sạch giá
   * trị của chúng.
   *
   * Hai lớp, và cả hai đều cần thiết:
   *
   * 1. **Allowlist khoá** (`DOMAIN_AUDIT_METADATA_KEYS`) — §10: "Không log raw
   *    request payload chứa CV, contact data hoặc model prompt". Một khoá không
   *    khai báo bị bỏ, nên `metadata: { ...dto }` vô tình cũng không lọt được
   *    intro message ra ngoài.
   * 2. **`redact()` trên mọi giá trị chuỗi** — phòng thủ theo lớp. Khoá được
   *    phép vẫn có thể nhận giá trị bất ngờ: một `errorCode` do Prisma sinh ra
   *    có thể echo lại giá trị của một dòng dữ liệu. Lớp này không thay thế lớp
   *    trên, nó bọc lấy trường hợp caller cẩu thả.
   */
  private sanitizeMetadata(
    eventType: DomainAuditEventType,
    metadata: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!metadata) return Prisma.DbNull;

    const allowed = DOMAIN_AUDIT_METADATA_KEYS[eventType] ?? [];
    const result: Record<string, Prisma.InputJsonValue> = {};
    const dropped: string[] = [];

    for (const [key, value] of Object.entries(metadata)) {
      if (!allowed.includes(key)) {
        dropped.push(key);
        continue;
      }
      const clean = this.sanitizeValue(value);
      if (clean !== undefined) result[key] = clean;
    }

    if (dropped.length) {
      // Ghi tên khoá, không ghi giá trị: tên khoá là bug của lập trình viên và
      // cần thấy được; giá trị là thứ ta vừa từ chối ghi.
      this.logger.warn(
        `Audit ${eventType}: bỏ ${dropped.length} khoá metadata chưa khai báo (${dropped.join(', ')})`,
      );
    }

    return result;
  }

  private sanitizeValue(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    // NaN / Infinity không serialise được thành JSON hợp lệ (`JSON.stringify`
    // biến chúng thành `null`), nên bỏ hẳn còn trung thực hơn là ghi `null`.
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      return redact(value).text.slice(0, MAX_STRING_LENGTH);
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => this.sanitizeValue(item))
        .filter((item): item is Prisma.InputJsonValue => item !== undefined);
    }
    // Object lồng nhau bị bỏ có chủ ý: nó là cách một payload nguyên vẹn lọt vào
    // audit. Caller cần thêm gì thì phải làm phẳng và khai báo khoá.
    return undefined;
  }
}
