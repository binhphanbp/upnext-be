/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReputationLedgerService } from './reputation-ledger.service';
import { ReputationScoringService } from './reputation-scoring.service';
import { REPUTATION_CONFIG } from './reputation.config';

describe('ReputationScoringService', () => {
  let service: ReputationScoringService;
  let prismaMock: any;
  let reputationLedgerMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prismaMock)),
      application: {
        findMany: jest.fn(),
      },
      jobPost: {
        findMany: jest.fn(),
      },
      companyReputationActivity: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      recruiterAccount: {
        findMany: jest.fn(),
      },
      jobReputationEvaluation: {
        create: jest.fn(),
      },
    };

    reputationLedgerMock = {
      applyDelta: jest.fn(),
    };

    notificationsServiceMock = {
      createNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReputationScoringService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReputationLedgerService, useValue: reputationLedgerMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<ReputationScoringService>(ReputationScoringService);
  });

  describe('evaluateNeglectedCvPenalty', () => {
    it('deducts reputation points and warns once the job expired 14 days ago with the application untouched', async () => {
      const now = new Date();
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      prismaMock.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          submittedAt: twentyDaysAgo,
          candidateProfile: { id: 'cand-1', account: { fullName: 'Nguyen Van A' } },
          jobPost: {
            id: 'job-1',
            title: 'Senior Frontend Engineer',
            companyId: 'company-1',
            expiredAt: fifteenDaysAgo,
            company: { id: 'company-1', name: 'Công ty ABC' },
          },
        },
      ]);

      prismaMock.companyReputationActivity.findFirst.mockResolvedValue(null);
      prismaMock.recruiterAccount.findMany.mockResolvedValue([
        { id: 'recruiter-1' },
        { id: 'recruiter-2' },
      ]);

      await service.evaluateNeglectedCvPenalty();

      expect(reputationLedgerMock.applyDelta).toHaveBeenCalledWith(
        expect.anything(),
        'company-1',
        -REPUTATION_CONFIG.CV_NEGLECT_PENALTY,
        'NEGLECTED_CV_PENALTY',
        expect.stringContaining('app-1'),
      );

      expect(notificationsServiceMock.createNotification).toHaveBeenCalledTimes(2);
      expect(notificationsServiceMock.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'recruiter-1',
          recipientType: ActorType.RECRUITER,
          title: expect.stringContaining('bỏ lơ CV quá hạn'),
          targetType: 'REPUTATION',
        }),
      );
    });

    it('counts the 14 days from the job expiry, never from the submission date', async () => {
      prismaMock.application.findMany.mockResolvedValue([]);

      await service.evaluateNeglectedCvPenalty();

      const [{ where }] = prismaMock.application.findMany.mock.calls[0];
      // Đếm từ `submittedAt` sẽ phạt công ty khi tin vẫn đang tuyển và hạn nhận hồ sơ
      // còn chưa tới — đó là lỗi cũ.
      expect(where.submittedAt).toBeUndefined();
      expect(where.jobPost.expiredAt.not).toBeNull();
      expect(where.jobPost.expiredAt.lte).toBeInstanceOf(Date);

      const daysBack = Math.round(
        (Date.now() - (where.jobPost.expiredAt.lte as Date).getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(daysBack).toBe(REPUTATION_CONFIG.CV_NEGLECT_DAYS);
    });

    it('leaves an application alone while its job post is still open', async () => {
      // Tin chưa hết hạn thì không rơi vào filter, nên không có gì để phạt.
      prismaMock.application.findMany.mockResolvedValue([]);

      await service.evaluateNeglectedCvPenalty();

      expect(reputationLedgerMock.applyDelta).not.toHaveBeenCalled();
      expect(notificationsServiceMock.createNotification).not.toHaveBeenCalled();
    });

    it('skips penalizing if the application was already penalized', async () => {
      const now = new Date();
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      prismaMock.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          submittedAt: fifteenDaysAgo,
          candidateProfile: { id: 'cand-1', account: { fullName: 'Nguyen Van A' } },
          jobPost: {
            id: 'job-1',
            title: 'Senior Frontend Engineer',
            companyId: 'company-1',
            expiredAt: fifteenDaysAgo,
            company: { id: 'company-1', name: 'Công ty ABC' },
          },
        },
      ]);

      prismaMock.companyReputationActivity.findFirst.mockResolvedValue({ id: 'existing-penalty' });

      await service.evaluateNeglectedCvPenalty();

      expect(reputationLedgerMock.applyDelta).not.toHaveBeenCalled();
      expect(notificationsServiceMock.createNotification).not.toHaveBeenCalled();
    });
  });
});
