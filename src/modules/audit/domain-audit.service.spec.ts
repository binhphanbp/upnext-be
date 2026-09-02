import { Logger } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DOMAIN_AUDIT_AGGREGATES, DOMAIN_AUDIT_EVENTS } from './domain-audit.events';
import { DomainAuditService } from './domain-audit.service';

describe('DomainAuditService', () => {
  let prisma: {
    domainAuditEvent: { create: jest.Mock };
  };
  let service: DomainAuditService;

  /** Metadata thực tế được ghi xuống DB ở lần gọi `create` gần nhất. */
  const writtenMetadata = () =>
    prisma.domainAuditEvent.create.mock.calls[0][0].data.metadata as Record<string, unknown>;

  beforeEach(() => {
    prisma = {
      domainAuditEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'audit-1',
          eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_RUN_CREATED,
          createdAt: new Date(),
        }),
      },
    };
    service = new DomainAuditService(prisma as unknown as PrismaService);
    // Nest Logger ghi thẳng ra stdout, không qua console.warn -- spy vào
    // prototype mới thực sự làm output của test đọc được.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('ghi được audit cho actor là recruiter — điều AdminAuditLog không làm được', async () => {
    await service.record({
      eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_RUN_CREATED,
      aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_DISCOVERY_RUN,
      aggregateId: 'run-1',
      actorType: ActorType.RECRUITER,
      actorId: 'recruiter-1',
      companyId: 'company-1',
      metadata: { jobPostId: 'job-1', maxResults: 30 },
    });

    const data = prisma.domainAuditEvent.create.mock.calls[0][0].data;
    expect(data.actorType).toBe(ActorType.RECRUITER);
    expect(data.actorId).toBe('recruiter-1');
    expect(data.metadata).toEqual({ jobPostId: 'job-1', maxResults: 30 });
  });

  it('dùng client transaction được truyền vào thay vì PrismaService', async () => {
    const tx = { domainAuditEvent: { create: jest.fn().mockResolvedValue({}) } };

    await service.record(
      {
        eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_CONSENT_REVOKED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.CANDIDATE_PROFILE,
        aggregateId: 'profile-1',
      },
      tx as unknown as Prisma.TransactionClient,
    );

    // Audit phải commit nguyên tử cùng hành động nó mô tả (§2.6): nếu nó đi qua
    // PrismaService thì một rollback sẽ để lại audit cho hành động không xảy ra.
    expect(tx.domainAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.domainAuditEvent.create).not.toHaveBeenCalled();
  });

  describe('sanitizeMetadata', () => {
    it('bỏ khoá không khai báo — payload nguyên vẹn không lọt vào audit', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.CONTACT_REQUESTED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_CONTACT_REQUEST,
        aggregateId: 'request-1',
        metadata: {
          requestId: 'request-1',
          // Đây là kịch bản thật: một caller viết `metadata: { ...dto }`.
          introMessage: 'Chào bạn, mình là HR công ty X, liên hệ mình ở 0901234567',
          candidateProfileId: 'profile-1',
          parsedText: 'toàn bộ CV',
        },
      });

      expect(writtenMetadata()).toEqual({ requestId: 'request-1' });
    });

    it('redact giá trị chuỗi của khoá được phép — phòng thủ theo lớp', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_RUN_FAILED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_DISCOVERY_RUN,
        aggregateId: 'run-1',
        // Một lỗi Prisma có thể echo lại giá trị của dòng dữ liệu gây lỗi.
        metadata: { errorCode: 'Unique constraint failed: a@b.com / 0901234567' },
      });

      const errorCode = writtenMetadata().errorCode as string;
      expect(errorCode).not.toContain('a@b.com');
      expect(errorCode).not.toContain('0901234567');
      expect(errorCode).toContain('Unique constraint failed');
    });

    it('ẩn hoàn toàn liên kết, không giữ host', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_RUN_FAILED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_DISCOVERY_RUN,
        aggregateId: 'run-1',
        metadata: { errorCode: 'fetch https://github.com/hoten-cuatoi failed' },
      });

      expect(writtenMetadata().errorCode).not.toContain('github.com');
    });

    it('bỏ object lồng nhau', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_RUN_COMPLETED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_DISCOVERY_RUN,
        aggregateId: 'run-1',
        metadata: {
          resultCount: 3,
          // `jobPostId` được phép, nhưng ở đây nó là object — đó là cách một
          // payload nguyên vẹn lọt vào dưới một tên khoá hợp lệ.
          jobPostId: { id: 'job-1', description: 'JD đầy đủ' },
        },
      });

      expect(writtenMetadata()).toEqual({ resultCount: 3 });
    });

    it('giữ mảng rule id nhưng chặn độ dài', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.CONTACT_EXCHANGE_BLOCKED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.CONVERSATION,
        aggregateId: 'conversation-1',
        metadata: {
          ruleIds: Array.from({ length: 50 }, (_, index) => `RULE_${index}`),
          matchCount: 2,
        },
      });

      expect((writtenMetadata().ruleIds as string[]).length).toBe(20);
      expect(writtenMetadata().matchCount).toBe(2);
    });

    it('chuyển Date thành ISO và bỏ giá trị null/undefined', async () => {
      const nextEligibleAt = new Date('2026-10-01T00:00:00.000Z');

      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_EXPOSURE_RECORDED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.CANDIDATE_PROFILE,
        aggregateId: 'profile-1',
        metadata: { nextEligibleAt, runId: null, jobPostId: undefined },
      });

      expect(writtenMetadata()).toEqual({ nextEligibleAt: nextEligibleAt.toISOString() });
    });

    it('ghi DbNull khi không có metadata', async () => {
      await service.record({
        eventType: DOMAIN_AUDIT_EVENTS.CONTACT_EXPIRED,
        aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_CONTACT_REQUEST,
        aggregateId: 'request-1',
      });

      expect(prisma.domainAuditEvent.create.mock.calls[0][0].data.metadata).toBe(Prisma.DbNull);
    });
  });

  describe('recordSafely', () => {
    it('không làm hỏng hành động chính khi ghi audit thất bại', async () => {
      prisma.domainAuditEvent.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.recordSafely({
          eventType: DOMAIN_AUDIT_EVENTS.RECOMMENDATION_VIEWED,
          aggregateType: DOMAIN_AUDIT_AGGREGATES.TALENT_DISCOVERY_RUN,
          aggregateId: 'run-1',
        }),
      ).resolves.toBeNull();
    });

    it('ngược lại, record() vẫn ném lỗi để event chứng minh quyết định không bị mất lặng lẽ', async () => {
      prisma.domainAuditEvent.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.record({
          eventType: DOMAIN_AUDIT_EVENTS.DISCOVERY_CONSENT_REVOKED,
          aggregateType: DOMAIN_AUDIT_AGGREGATES.CANDIDATE_PROFILE,
          aggregateId: 'profile-1',
        }),
      ).rejects.toThrow('DB down');
    });
  });
});
