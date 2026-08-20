import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  PlanAudience,
  SubscriptionCheckoutStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateSandboxCheckoutDto } from './dto/candidate-sandbox-checkout.dto';
import { RecruiterSandboxCheckoutDto } from '../company-subscriptions/dto/recruiter-sandbox-checkout.dto';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionFeature } from './feature-registry';

const actor = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'candidate@example.test',
  role: ActorType.CANDIDATE,
  permissions: [],
};

const dto: CandidateSandboxCheckoutDto = {
  planId: '22222222-2222-2222-2222-222222222222',
  idempotencyKey: 'candidate-upgrade-0001',
};

const recruiterDto: RecruiterSandboxCheckoutDto = {
  planId: '33333333-3333-3333-3333-333333333333',
  idempotencyKey: 'recruiter-upgrade-0001',
};

const publicPlan = {
  id: dto.planId,
  code: 'CANDIDATE_PRO',
  subscriptionName: 'Candidate Pro',
  audience: PlanAudience.CANDIDATE,
  price: { toString: () => '99000' },
  durationDays: 30,
  features: [{ feature: SubscriptionFeature.AI_COPILOT_RUN, enabled: true, limitValue: 100 }],
};

function buildPrisma() {
  const tx = {
    subscriptionCheckout: {
      upsert: jest.fn().mockResolvedValue({
        id: 'checkout-1',
        subscriptionPlanId: dto.planId,
        status: SubscriptionCheckoutStatus.PENDING,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'checkout-1' }),
    },
    candidateSubscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'candidate-subscription-1',
        startedAt: new Date('2026-08-19T00:00:00.000Z'),
        expiredAt: new Date('2026-09-18T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
        source: 'SANDBOX_CHECKOUT',
        plan: { code: 'CANDIDATE_PRO', subscriptionName: 'Candidate Pro' },
      }),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    candidateSubscriptionQuotaCounter: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    companySubscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'company-subscription-1',
        startedAt: new Date('2026-08-19T00:00:00.000Z'),
        expiredAt: new Date('2026-09-18T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
        source: 'SANDBOX_CHECKOUT',
        plan: { code: 'RECRUITER_PRO', subscriptionName: 'Recruiter Pro' },
      }),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    subscriptionQuotaCounter: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionLifecycleEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn(),
    },
  };
  return {
    subscriptionPlan: { findFirst: jest.fn().mockResolvedValue(publicPlan) },
    candidateSubscription: tx.candidateSubscription,
    companySubscription: tx.companySubscription,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    tx,
  };
}

describe('SubscriptionLifecycleService', () => {
  it('keeps sandbox checkout disabled unless rollout explicitly enables it', async () => {
    const prisma = buildPrisma();
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService,
    );

    await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.subscriptionPlan.findFirst).not.toHaveBeenCalled();
  });

  it('activates exactly one candidate plan, materializes allowance, and records evidence', async () => {
    const prisma = buildPrisma();
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    const result = await service.candidateSandboxCheckout('profile-1', actor, dto);

    expect(result.replayed).toBe(false);
    expect(prisma.tx.candidateSubscription.updateMany).toHaveBeenCalledWith({
      where: { candidateProfileId: 'profile-1', status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.INACTIVE },
    });
    expect(prisma.tx.candidateSubscriptionQuotaCounter.createMany).toHaveBeenCalled();
    expect(prisma.tx.subscriptionCheckout.update).toHaveBeenCalledWith({
      where: { id: 'checkout-1' },
      data: { subscriptionId: 'candidate-subscription-1' },
    });
    expect(prisma.tx.subscriptionLifecycleEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ eventType: 'CHECKOUT_COMPLETED' }),
        ]),
      }),
    );
  });

  it('replays the subscription linked to the original checkout, not a newer active plan', async () => {
    const prisma = buildPrisma();
    prisma.tx.subscriptionCheckout.upsert.mockResolvedValue({
      id: 'checkout-1',
      subscriptionPlanId: dto.planId,
      subscriptionId: 'original-subscription',
      status: SubscriptionCheckoutStatus.COMPLETED,
    });
    prisma.tx.subscriptionCheckout.updateMany.mockResolvedValue({ count: 0 });
    prisma.tx.candidateSubscription.findFirst.mockResolvedValue({
      id: 'original-subscription',
      startedAt: new Date('2026-08-19T00:00:00.000Z'),
      expiredAt: new Date('2026-09-18T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
      source: 'SANDBOX_CHECKOUT',
      plan: { code: 'CANDIDATE_PRO', subscriptionName: 'Candidate Pro' },
    });
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    const result = await service.candidateSandboxCheckout('profile-1', actor, dto);

    expect(result.replayed).toBe(true);
    expect(prisma.tx.candidateSubscription.findFirst).toHaveBeenCalledWith({
      where: { id: 'original-subscription', candidateProfileId: 'profile-1' },
      include: { plan: true },
    });
    expect(prisma.tx.candidateSubscription.create).not.toHaveBeenCalled();
  });

  it('does not offer private, inactive, free, or recruiter plans as a candidate checkout', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does not enable sandbox checkout in production even if its feature flag is accidentally true', async () => {
    const prisma = buildPrisma();
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      {
        get: jest.fn((key: string) =>
          key === 'subscriptionSandboxCheckoutEnabled' ? true : 'production',
        ),
      } as unknown as ConfigService,
    );

    await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.subscriptionPlan.findFirst).not.toHaveBeenCalled();
  });

  it('activates a public recruiter plan for the token company, with its own checkout evidence', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      ...publicPlan,
      id: recruiterDto.planId,
      code: 'RECRUITER_PRO',
      subscriptionName: 'Recruiter Pro',
      audience: PlanAudience.RECRUITER,
      features: [{ feature: SubscriptionFeature.AI_JD_GENERATE, enabled: true, limitValue: 20 }],
    });
    prisma.tx.subscriptionCheckout.upsert.mockResolvedValue({
      id: 'recruiter-checkout-1',
      subscriptionPlanId: recruiterDto.planId,
      status: SubscriptionCheckoutStatus.PENDING,
    });
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );
    const recruiter = { ...actor, role: ActorType.RECRUITER, companyId: 'company-1' };

    const result = await service.recruiterSandboxCheckout('company-1', recruiter, recruiterDto);

    expect(result.replayed).toBe(false);
    expect(prisma.tx.companySubscription.updateMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.INACTIVE },
    });
    expect(prisma.tx.companySubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company-1', source: 'SANDBOX_CHECKOUT' }),
        include: { plan: true },
      }),
    );
    expect(prisma.tx.subscriptionQuotaCounter.createMany).toHaveBeenCalled();
    expect(prisma.tx.subscriptionLifecycleEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            audience: PlanAudience.RECRUITER,
            eventType: 'CHECKOUT_COMPLETED',
          }),
        ]),
      }),
    );
  });

  // Mỗi checkout thành công tạo một hàng subscription mới với bộ đếm về 0.  Đó là
  // hành vi đúng khi đi lên từ gói Free, và là một cách reset hạn mức nếu người dùng
  // đang ở gói trả phí.  `idempotencyKey` không chặn được: hai key khác nhau cho cùng
  // một gói là hai checkout hợp lệ.  Bốn test dưới đây khóa đúng ranh giới đó.
  describe('không cho mua lại gói trả phí để reset hạn mức', () => {
    function activePaidPlan(planId: string) {
      return { planId, plan: { price: { toString: () => '99000' } } };
    }

    it('từ chối mua lại đúng gói đang dùng, và không ghi gì cả', async () => {
      const prisma = buildPrisma();
      prisma.tx.candidateSubscription.findFirst.mockResolvedValue(activePaidPlan(dto.planId));
      const service = new SubscriptionLifecycleService(
        prisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      );

      await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toMatchObject(
        { response: { code: 'SUBSCRIPTION_ALREADY_ACTIVE' } },
      );
      expect(prisma.tx.candidateSubscription.updateMany).not.toHaveBeenCalled();
      expect(prisma.tx.candidateSubscription.create).not.toHaveBeenCalled();
      expect(prisma.tx.candidateSubscriptionQuotaCounter.createMany).not.toHaveBeenCalled();
    });

    it('từ chối đổi sang gói trả phí khác giữa chu kỳ', async () => {
      const prisma = buildPrisma();
      prisma.tx.candidateSubscription.findFirst.mockResolvedValue(
        activePaidPlan('99999999-9999-9999-9999-999999999999'),
      );
      const service = new SubscriptionLifecycleService(
        prisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      );

      await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toMatchObject(
        { response: { code: 'SUBSCRIPTION_CHANGE_NOT_SUPPORTED' } },
      );
      expect(prisma.tx.candidateSubscription.create).not.toHaveBeenCalled();
    });

    // §8.6 của kế hoạch nghiệp vụ: "Free -> trả phí" là dòng DUY NHẤT được bắt đầu chu
    // kỳ mới với bộ đếm reset về 0.  Guard ở trên không được chặn dòng này, nếu không
    // thì không ai mua được gói đầu tiên.
    it('vẫn cho đi lên từ gói Free và reset bộ đếm — đúng §8.6 dòng 1', async () => {
      const prisma = buildPrisma();
      prisma.tx.candidateSubscription.findFirst.mockResolvedValue({
        planId: 'free-plan-id',
        plan: { price: { toString: () => '0' } },
      });
      const service = new SubscriptionLifecycleService(
        prisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      );

      const result = await service.candidateSandboxCheckout('profile-1', actor, dto);

      expect(result.replayed).toBe(false);
      expect(prisma.tx.candidateSubscription.create).toHaveBeenCalled();
      expect(prisma.tx.candidateSubscriptionQuotaCounter.createMany).toHaveBeenCalled();
    });

    it('áp dụng cùng ranh giới đó cho phía nhà tuyển dụng', async () => {
      const prisma = buildPrisma();
      prisma.subscriptionPlan.findFirst.mockResolvedValue({
        ...publicPlan,
        id: recruiterDto.planId,
        audience: PlanAudience.RECRUITER,
      });
      prisma.tx.subscriptionCheckout.upsert.mockResolvedValue({
        id: 'recruiter-checkout-1',
        subscriptionPlanId: recruiterDto.planId,
        status: SubscriptionCheckoutStatus.PENDING,
      });
      prisma.tx.companySubscription.findFirst.mockResolvedValue(
        activePaidPlan(recruiterDto.planId),
      );
      const service = new SubscriptionLifecycleService(
        prisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      );
      const recruiter = { ...actor, role: ActorType.RECRUITER, companyId: 'company-1' };

      await expect(
        service.recruiterSandboxCheckout('company-1', recruiter, recruiterDto),
      ).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_ALREADY_ACTIVE' } });
      expect(prisma.tx.companySubscription.updateMany).not.toHaveBeenCalled();
      expect(prisma.tx.companySubscription.create).not.toHaveBeenCalled();
    });
  });
});
