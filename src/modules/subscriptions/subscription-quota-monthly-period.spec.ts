import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionFeature } from './feature-registry';
import { SubscriptionQuotaService } from './subscription-quota.service';

/**
 * Cửa sổ counter theo từng feature (§1, §8).
 *
 * Tách khỏi `subscription-quota.service.spec.ts` vì đây là một mối quan tâm
 * riêng và nó cần fixture gói năm — thứ mà spec kia không có, và cũng không nên
 * có, vì mọi test ở đó đang chứng minh hành vi của gói 30 ngày.
 */

const asTx = (mock: unknown) => mock as Prisma.TransactionClient;

/** Gói 30 ngày: đúng những gì đang bán hôm nay. */
const MONTHLY_PLAN_START = new Date('2026-07-31T00:00:00.000Z');
const MONTHLY_PLAN_END = new Date('2026-08-30T00:00:00.000Z');

const thirtyDaySubscription = {
  id: 'sub-1',
  planId: 'plan-1',
  companyId: 'company-1',
  startedAt: MONTHLY_PLAN_START,
  expiredAt: MONTHLY_PLAN_END,
  currentPeriodStart: MONTHLY_PLAN_START,
  currentPeriodEnd: MONTHLY_PLAN_END,
};

/** Gói năm: trường hợp mà cửa sổ SUBSCRIPTION cho ra một hạn mức cả năm. */
const annualSubscription = {
  ...thirtyDaySubscription,
  startedAt: new Date('2026-01-15T00:00:00.000Z'),
  expiredAt: new Date('2027-01-15T00:00:00.000Z'),
  currentPeriodStart: new Date('2026-01-15T00:00:00.000Z'),
  currentPeriodEnd: new Date('2027-01-15T00:00:00.000Z'),
};

function buildMockPrisma() {
  return {
    companySubscription: {
      findFirst: jest.fn().mockResolvedValue(thirtyDaySubscription),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    subscriptionPlan: { findFirst: jest.fn() },
    planFeature: {
      findUnique: jest.fn().mockResolvedValue({
        planId: 'plan-1',
        feature: SubscriptionFeature.TALENT_DISCOVERY_RUN,
        enabled: true,
        limitValue: 10,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionQuotaCounter: {
      upsert: jest.fn().mockResolvedValue({ id: 'counter-1', limitValue: 10, usedValue: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionUsage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
    },
    subscriptionLifecycleEvent: { create: jest.fn() },
  };
}

const consumeInput = {
  companyId: 'company-1',
  feature: SubscriptionFeature.TALENT_DISCOVERY_RUN,
  referenceType: 'TALENT_DISCOVERY_RUN',
  referenceId: '11111111-1111-1111-1111-111111111111',
  idempotencyKey: 'talent-discovery:company-1:req-1',
};

describe('SubscriptionQuotaService — cửa sổ counter theo feature', () => {
  let service: SubscriptionQuotaService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  const upsertArgs = () =>
    prisma.subscriptionQuotaCounter.upsert.mock.calls[0][0] as {
      where: { companySubscriptionId_feature_periodStart: { periodStart: Date } };
      create: { periodStart: Date; periodEnd: Date };
    };

  const planFeature = (feature: string, limitValue: number | null) => ({
    planId: 'plan-1',
    feature,
    enabled: true,
    limitValue,
  });

  beforeEach(async () => {
    prisma = buildMockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionQuotaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SubscriptionQuotaService);
  });

  afterEach(() => jest.useRealTimers());

  describe('gói 30 ngày — chứng minh không cần migration dữ liệu', () => {
    it('feature MONTHLY dùng ĐÚNG periodStart cũ, tức CÙNG một dòng counter', async () => {
      // Assertion quan trọng nhất của cả PR này. Mọi plan đang bán đều
      // `durationDays = 30`, nên `n = 0` và `resolveMonthlyWindow` phải trả về
      // đúng giá trị mà `resolvePeriod` trả về hôm nay. Nếu test này đỏ thì thay
      // đổi đã tạo counter mới cho các subscription đang chạy — tức reset hạn
      // mức của khách hàng thật giữa chu kỳ.
      await service.consume(asTx(prisma), consumeInput);

      const args = upsertArgs();
      expect(args.where.companySubscriptionId_feature_periodStart.periodStart.toISOString()).toBe(
        MONTHLY_PLAN_START.toISOString(),
      );
      expect(args.create.periodEnd.toISOString()).toBe(MONTHLY_PLAN_END.toISOString());
    });

    it('feature SUBSCRIPTION cũng vậy — hai loại feature không phân kỳ trên gói 30 ngày', async () => {
      prisma.planFeature.findUnique.mockResolvedValue(
        planFeature(SubscriptionFeature.AI_CV_MATCHING, 150),
      );

      await service.consume(asTx(prisma), {
        ...consumeInput,
        feature: SubscriptionFeature.AI_CV_MATCHING,
      });

      expect(
        upsertArgs().where.companySubscriptionId_feature_periodStart.periodStart.toISOString(),
      ).toBe(MONTHLY_PLAN_START.toISOString());
    });
  });

  describe('gói năm — nơi thay đổi thực sự có tác dụng', () => {
    beforeEach(() => {
      prisma.companySubscription.findFirst.mockResolvedValue(annualSubscription);
      jest.useFakeTimers().setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    });

    it('feature SUBSCRIPTION giữ nguyên cửa sổ cả năm — chín key cũ không đổi hành vi', async () => {
      // Đây là điều khiến thay đổi này an toàn để ship: counter và lịch sử của
      // `ai_cv_matching`, `featured_job`, `cv_pool_view`... giữ nguyên từng byte.
      prisma.planFeature.findUnique.mockResolvedValue(
        planFeature(SubscriptionFeature.AI_CV_MATCHING, 1250),
      );

      await service.consume(asTx(prisma), {
        ...consumeInput,
        feature: SubscriptionFeature.AI_CV_MATCHING,
      });

      const args = upsertArgs();
      expect(args.create.periodStart.toISOString()).toBe('2026-01-15T00:00:00.000Z');
      expect(args.create.periodEnd.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    });

    it('talent_discovery_run thu về cửa sổ đúng một tháng', async () => {
      await service.consume(asTx(prisma), consumeInput);

      const args = upsertArgs();
      expect(args.create.periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
      expect(args.create.periodEnd.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    });

    it('talent_contact cũng là MONTHLY (§8)', async () => {
      prisma.planFeature.findUnique.mockResolvedValue(
        planFeature(SubscriptionFeature.TALENT_CONTACT, 250),
      );

      await service.consume(asTx(prisma), {
        ...consumeInput,
        feature: SubscriptionFeature.TALENT_CONTACT,
      });

      expect(upsertArgs().create.periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('hai lần consume trong cùng tháng dùng cùng một dòng counter', async () => {
      await service.consume(asTx(prisma), consumeInput);
      jest.setSystemTime(new Date('2026-04-14T23:00:00.000Z'));
      await service.consume(asTx(prisma), { ...consumeInput, idempotencyKey: 'req-2' });

      const [first, second] = prisma.subscriptionQuotaCounter.upsert.mock.calls.map(
        (call) =>
          (
            call[0] as {
              where: { companySubscriptionId_feature_periodStart: { periodStart: Date } };
            }
          ).where.companySubscriptionId_feature_periodStart.periodStart,
      );
      expect(second.toISOString()).toBe(first.toISOString());
    });

    it('sang tháng sau thì là dòng counter mới — hạn mức reset mà không cần cron', async () => {
      await service.consume(asTx(prisma), consumeInput);
      jest.setSystemTime(new Date('2026-04-16T00:00:00.000Z'));
      await service.consume(asTx(prisma), { ...consumeInput, idempotencyKey: 'req-2' });

      const [first, second] = prisma.subscriptionQuotaCounter.upsert.mock.calls.map(
        (call) =>
          (
            call[0] as {
              where: { companySubscriptionId_feature_periodStart: { periodStart: Date } };
            }
          ).where.companySubscriptionId_feature_periodStart.periodStart,
      );
      expect(second.toISOString()).not.toBe(first.toISOString());
      expect(second.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    });
  });

  describe('peek', () => {
    beforeEach(() => {
      prisma.companySubscription.findFirst.mockResolvedValue(annualSubscription);
      jest.useFakeTimers().setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    });

    it('trả periodEnd theo TỪNG feature, để UI in đúng ngày reset (§8)', async () => {
      prisma.planFeature.findMany.mockResolvedValue([
        planFeature(SubscriptionFeature.AI_CV_MATCHING, 1250),
        planFeature(SubscriptionFeature.TALENT_DISCOVERY_RUN, 10),
      ]);

      const snapshots = await service.peek('company-1');
      const byFeature = new Map(snapshots.map((row) => [row.feature, row]));

      // Feature SUBSCRIPTION: reset khi hết gói.
      expect(byFeature.get(SubscriptionFeature.AI_CV_MATCHING)!.periodEnd.toISOString()).toBe(
        '2027-01-15T00:00:00.000Z',
      );
      // Feature MONTHLY: reset tháng sau.
      expect(byFeature.get(SubscriptionFeature.TALENT_DISCOVERY_RUN)!.periodEnd.toISOString()).toBe(
        '2026-04-15T00:00:00.000Z',
      );
    });

    it('khớp counter theo cả feature VÀ cửa sổ, không chỉ theo feature', async () => {
      // Nếu chỉ khoá theo `feature`, usage của một cửa sổ cũ sẽ bị đọc thành
      // usage của cửa sổ hiện tại — hoặc ngược lại, usage hiện tại hiện thành 0.
      // Kiểu lỗi tệ nhất, vì "còn nguyên hạn mức" trông như tin tốt.
      prisma.planFeature.findMany.mockResolvedValue([
        planFeature(SubscriptionFeature.TALENT_DISCOVERY_RUN, 10),
      ]);
      prisma.subscriptionQuotaCounter.findMany.mockResolvedValue([
        {
          feature: SubscriptionFeature.TALENT_DISCOVERY_RUN,
          usedValue: 9,
          periodStart: new Date('2026-02-15T00:00:00.000Z'), // cửa sổ cũ
        },
        {
          feature: SubscriptionFeature.TALENT_DISCOVERY_RUN,
          usedValue: 2,
          periodStart: new Date('2026-03-15T00:00:00.000Z'), // cửa sổ hiện tại
        },
      ]);

      const [snapshot] = await service.peek('company-1');

      expect(snapshot.used).toBe(2);
      expect(snapshot.remaining).toBe(8);
    });

    it('chỉ truy vấn counter cho các cửa sổ đang dùng, không truy vấn mỗi feature một lần', async () => {
      prisma.planFeature.findMany.mockResolvedValue([
        planFeature(SubscriptionFeature.AI_CV_MATCHING, 1250),
        planFeature(SubscriptionFeature.AI_JD_GENERATE, 150),
        planFeature(SubscriptionFeature.TALENT_DISCOVERY_RUN, 10),
        planFeature(SubscriptionFeature.TALENT_CONTACT, 250),
      ]);

      await service.peek('company-1');

      expect(prisma.subscriptionQuotaCounter.findMany).toHaveBeenCalledTimes(1);
      const [args] = prisma.subscriptionQuotaCounter.findMany.mock.calls[0] as [
        { where: { periodStart: { in: Date[] } } },
      ];
      // Bốn feature nhưng chỉ hai cửa sổ riêng biệt.
      expect(args.where.periodStart.in).toHaveLength(2);
    });

    it('coi key lạ (dữ liệu lịch sử) là SUBSCRIPTION thay vì ném', async () => {
      // Cột `feature` là `VARCHAR(60)`, không phải enum, nên `plan_features` có
      // thể còn dòng của một key đã bị bỏ. Một dòng cũ không được làm sập trang
      // billing của công ty.
      prisma.planFeature.findMany.mockResolvedValue([planFeature('legacy_retired_feature', 5)]);

      const [snapshot] = await service.peek('company-1');

      expect(snapshot.periodEnd.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    });
  });
});
