import { NotFoundException } from '@nestjs/common';
import { ActorType, PlanAudience } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateSubscriptionController } from './candidate-subscription.controller';
import { CandidateSubscriptionQuotaService } from './candidate-subscription-quota.service';

describe('CandidateSubscriptionController', () => {
  const prisma = {
    candidateProfile: { findUnique: jest.fn() },
  };
  const quota = {
    activePlan: jest.fn(),
    peek: jest.fn(),
  };
  const user: AuthenticatedUser = {
    id: 'candidate-account-1',
    email: 'candidate@example.test',
    role: ActorType.CANDIDATE,
    permissions: [],
  };
  let controller: CandidateSubscriptionController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CandidateSubscriptionController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: CandidateSubscriptionQuotaService, useValue: quota },
      ],
    }).compile();
    controller = module.get(CandidateSubscriptionController);
  });

  it('returns the active candidate plan and usage after resolving the plan first', async () => {
    prisma.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-1' });
    quota.activePlan.mockResolvedValue({
      plan: {
        code: 'CANDIDATE_FREE',
        subscriptionName: 'Candidate Free',
        audience: PlanAudience.CANDIDATE,
      },
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      expiredAt: new Date('2026-08-31T00:00:00.000Z'),
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    quota.peek.mockResolvedValue([]);

    await expect(controller.me(user)).resolves.toEqual({
      data: {
        plan: {
          code: 'CANDIDATE_FREE',
          name: 'Candidate Free',
          audience: PlanAudience.CANDIDATE,
          expiresAt: new Date('2026-08-31T00:00:00.000Z'),
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T00:00:00.000Z'),
        },
        usage: [],
      },
    });
    expect(quota.activePlan.mock.invocationCallOrder[0]).toBeLessThan(
      quota.peek.mock.invocationCallOrder[0],
    );
  });

  it('does not expose a subscription response without a candidate profile', async () => {
    prisma.candidateProfile.findUnique.mockResolvedValue(null);

    await expect(controller.me(user)).rejects.toThrow(NotFoundException);
    expect(quota.activePlan).not.toHaveBeenCalled();
  });
});
