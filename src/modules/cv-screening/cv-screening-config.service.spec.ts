import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CvScreeningConfigService } from './cv-screening-config.service';
import { REFERENCE_WEIGHTS } from './screening-config.resolver';

const SENIOR_WEIGHTS = {
  weightSkills: 20,
  weightExperience: 50,
  weightProjects: 25,
  weightEducation: 5,
};

describe('CvScreeningConfigService', () => {
  function buildService() {
    const prisma = {
      recruiterAccount: {
        findUnique: jest.fn().mockResolvedValue({ companyId: 'company-1' }),
      },
      jobPost: {
        findUnique: jest.fn().mockResolvedValue({
          companyId: 'company-1',
          createdByRecruiterId: 'recruiter-1',
          accessRevocations: [],
        }),
      },
      cvScreeningCompanyConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
            Promise.resolve({ ...create, updatedAt: new Date() }),
          ),
      },
      jobPostCvScreeningConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
            Promise.resolve({ ...create, updatedAt: new Date() }),
          ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CvScreeningConfigService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  function actingUser(permissions: string[] = ['company:manage']): AuthenticatedUser {
    return { id: 'recruiter-1', permissions } as AuthenticatedUser;
  }

  describe('getConfig', () => {
    it('returns the system defaults when the company has no saved config', async () => {
      const { service } = buildService();

      const result = await service.getConfig('recruiter-1');

      expect(result).toMatchObject({
        scope: 'COMPANY',
        jobPostId: null,
        weights: REFERENCE_WEIGHTS,
        mustHaveCriteria: [],
        niceToHaveCriteria: [],
        customPrompt: null,
        passingScore: null,
        defaultTopN: null,
      });
    });

    it('returns the saved config, readable by any team member (no permission check)', async () => {
      const { service, prisma } = buildService();
      prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
        companyId: 'company-1',
        ...SENIOR_WEIGHTS,
        weightPreset: 'SENIOR',
        mustHaveCriteria: ['5 năm kinh nghiệm'],
        niceToHaveCriteria: ['Từng làm fintech'],
        customPrompt: 'Ưu tiên onboard sớm',
        passingScore: 70,
        defaultTopN: 20,
        updatedByAccountId: 'recruiter-owner',
        updatedAt: new Date(),
      });

      const result = await service.getConfig('recruiter-99');

      expect(result.weights).toEqual({
        skills: 20,
        experience: 50,
        projects: 25,
        education: 5,
      });
      expect(result).toMatchObject({
        weightPreset: 'SENIOR',
        mustHaveCriteria: ['5 năm kinh nghiệm'],
        niceToHaveCriteria: ['Từng làm fintech'],
        passingScore: 70,
        defaultTopN: 20,
      });
    });

    it('rejects a recruiter with no company', async () => {
      const { service, prisma } = buildService();
      prisma.recruiterAccount.findUnique.mockResolvedValue({ companyId: null });

      await expect(service.getConfig('recruiter-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateConfig (company scope)', () => {
    it('rejects a recruiter without company:manage permission', async () => {
      const { service } = buildService();

      await expect(service.updateConfig(actingUser([]), { customPrompt: 'Test' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('saves a full weight split, criteria and thresholds', async () => {
      const { service, prisma } = buildService();

      await service.updateConfig(actingUser(), {
        ...SENIOR_WEIGHTS,
        weightPreset: 'SENIOR',
        mustHaveCriteria: ['  5 năm kinh nghiệm ', '5 NĂM KINH NGHIỆM'],
        customPrompt: 'Ghi chú công ty',
      });

      const { create } = prisma.cvScreeningCompanyConfig.upsert.mock.calls[0][0];
      expect(create).toMatchObject({
        companyId: 'company-1',
        ...SENIOR_WEIGHTS,
        weightPreset: 'SENIOR',
        // Normalized: trimmed and de-duplicated case-insensitively.
        mustHaveCriteria: ['5 năm kinh nghiệm'],
        customPrompt: 'Ghi chú công ty',
        updatedByAccountId: 'recruiter-1',
      });
    });

    it('rejects a weight split that does not total 100', async () => {
      const { service } = buildService();

      await expect(
        service.updateConfig(actingUser(), {
          weightSkills: 40,
          weightExperience: 30,
          weightProjects: 20,
          weightEducation: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a partial weight split, which could never total 100', async () => {
      const { service } = buildService();

      await expect(service.updateConfig(actingUser(), { weightSkills: 50 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('a partial save only touches the fields sent', async () => {
      const { service, prisma } = buildService();

      await service.updateConfig(actingUser(), { customPrompt: 'Prompt duy nhất' });

      const { update } = prisma.cvScreeningCompanyConfig.upsert.mock.calls[0][0];
      expect(update).toEqual({
        customPrompt: 'Prompt duy nhất',
        updatedByAccountId: 'recruiter-1',
      });
      expect(update).not.toHaveProperty('weightSkills');
      expect(update).not.toHaveProperty('mustHaveCriteria');
    });
  });

  describe('job-post scope', () => {
    it('merges the job override over the company defaults and flags what is inherited', async () => {
      const { service, prisma } = buildService();
      prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
        ...SENIOR_WEIGHTS,
        customPrompt: 'Company prompt',
      });
      prisma.jobPostCvScreeningConfig.findUnique.mockResolvedValue({
        jobPostId: 'job-1',
        customPrompt: 'Job prompt',
        updatedAt: new Date(),
      });

      const result = await service.getJobConfig('recruiter-1', 'job-1');

      expect(result.scope).toBe('JOB_POST');
      expect(result.customPrompt).toBe('Job prompt');
      expect(result.weights).toEqual({ skills: 20, experience: 50, projects: 25, education: 5 });
      expect(result.inherited).toMatchObject({ customPrompt: false, weights: true });
    });

    it('is gated by per-job access, not company:manage', async () => {
      const { service, prisma } = buildService();
      // A team member without company:manage may still tune a job they can access.
      await expect(
        service.updateJobConfig(actingUser([]), 'job-1', { customPrompt: 'Test' }),
      ).resolves.toMatchObject({ customPrompt: 'Test' });

      // Access revoked for this specific job -> forbidden.
      prisma.jobPost.findUnique.mockResolvedValue({
        companyId: 'company-1',
        createdByRecruiterId: 'recruiter-other',
        accessRevocations: [{ id: 'revocation-1' }],
      });
      await expect(
        service.updateJobConfig(actingUser([]), 'job-1', { customPrompt: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a job post from another company', async () => {
      const { service, prisma } = buildService();
      prisma.jobPost.findUnique.mockResolvedValue({
        companyId: 'company-other',
        createdByRecruiterId: 'recruiter-1',
        accessRevocations: [],
      });

      await expect(service.getJobConfig('recruiter-1', 'job-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404s on a job post that does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.jobPost.findUnique.mockResolvedValue(null);

      await expect(service.getJobConfig('recruiter-1', 'job-1')).rejects.toThrow(NotFoundException);
    });

    it('resetting drops the override and falls back to the company defaults', async () => {
      const { service, prisma } = buildService();
      prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
        customPrompt: 'Default company',
      });

      const result = await service.resetJobConfig('recruiter-1', 'job-1');

      expect(prisma.jobPostCvScreeningConfig.deleteMany).toHaveBeenCalledWith({
        where: { jobPostId: 'job-1' },
      });
      expect(result.customPrompt).toBe('Default company');
      expect(result.inherited.customPrompt).toBe(true);
    });
  });
});
