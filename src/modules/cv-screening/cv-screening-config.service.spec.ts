import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CvScreeningConfigService } from './cv-screening-config.service';

describe('CvScreeningConfigService', () => {
  function buildService() {
    const prisma = {
      recruiterAccount: {
        findUnique: jest.fn().mockResolvedValue({ companyId: 'company-1' }),
      },
      cvScreeningCompanyConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const service = new CvScreeningConfigService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  function actingUser(permissions: string[] = ['company:manage']): AuthenticatedUser {
    return { id: 'recruiter-1', permissions } as AuthenticatedUser;
  }

  describe('getConfig', () => {
    it('returns system defaults when the company has no saved config', async () => {
      const { service } = buildService();

      const result = await service.getConfig('recruiter-1');

      expect(result).toEqual({
        customInstructions: null,
        defaultTopN: null,
        minSimilarityScore: null,
        updatedByAccountId: null,
        updatedAt: null,
      });
    });

    it('returns the saved config, readable by any team member (no permission check)', async () => {
      const { service, prisma } = buildService();
      const updatedAt = new Date();
      prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
        companyId: 'company-1',
        customInstructions: 'Ưu tiên AWS',
        defaultTopN: 20,
        minSimilarityScore: 60,
        updatedByAccountId: 'recruiter-owner',
        updatedAt,
        createdAt: updatedAt,
      });

      const result = await service.getConfig('recruiter-1');

      expect(result).toEqual({
        customInstructions: 'Ưu tiên AWS',
        defaultTopN: 20,
        minSimilarityScore: 60,
        updatedByAccountId: 'recruiter-owner',
        updatedAt,
      });
    });

    it('rejects a recruiter with no company', async () => {
      const { service, prisma } = buildService();
      prisma.recruiterAccount.findUnique.mockResolvedValue({ companyId: null });

      await expect(service.getConfig('recruiter-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateConfig', () => {
    it('rejects a recruiter without company:manage permission', async () => {
      const { service } = buildService();

      await expect(
        service.updateConfig(actingUser([]), { defaultTopN: 20 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('upserts the config and stamps who changed it', async () => {
      const { service, prisma } = buildService();
      const saved = {
        companyId: 'company-1',
        customInstructions: 'Ưu tiên AWS',
        defaultTopN: 20,
        minSimilarityScore: 60,
        updatedByAccountId: 'recruiter-1',
        updatedAt: new Date(),
      };
      prisma.cvScreeningCompanyConfig.upsert.mockResolvedValue(saved);

      const result = await service.updateConfig(actingUser(), {
        customInstructions: 'Ưu tiên AWS',
        defaultTopN: 20,
        minSimilarityScore: 60,
      });

      expect(prisma.cvScreeningCompanyConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1' },
          create: expect.objectContaining({
            companyId: 'company-1',
            customInstructions: 'Ưu tiên AWS',
            defaultTopN: 20,
            minSimilarityScore: 60,
            updatedByAccountId: 'recruiter-1',
          }),
          update: expect.objectContaining({
            customInstructions: 'Ưu tiên AWS',
            defaultTopN: 20,
            minSimilarityScore: 60,
            updatedByAccountId: 'recruiter-1',
          }),
        }),
      );
      expect(result.defaultTopN).toBe(20);
    });

    it('a partial update only touches the fields sent, leaving the others untouched', async () => {
      const { service, prisma } = buildService();
      prisma.cvScreeningCompanyConfig.upsert.mockResolvedValue({
        companyId: 'company-1',
        customInstructions: null,
        defaultTopN: 50,
        minSimilarityScore: null,
        updatedByAccountId: 'recruiter-1',
        updatedAt: new Date(),
      });

      await service.updateConfig(actingUser(), { defaultTopN: 50 });

      const { update } = prisma.cvScreeningCompanyConfig.upsert.mock.calls[0][0];
      expect(update).toEqual({ defaultTopN: 50, updatedByAccountId: 'recruiter-1' });
      expect(update).not.toHaveProperty('customInstructions');
      expect(update).not.toHaveProperty('minSimilarityScore');
    });

    it('an explicit null clears a previously saved value', async () => {
      const { service, prisma } = buildService();
      prisma.cvScreeningCompanyConfig.upsert.mockResolvedValue({
        companyId: 'company-1',
        customInstructions: null,
        defaultTopN: null,
        minSimilarityScore: null,
        updatedByAccountId: 'recruiter-1',
        updatedAt: new Date(),
      });

      await service.updateConfig(actingUser(), { defaultTopN: null });

      const { update } = prisma.cvScreeningCompanyConfig.upsert.mock.calls[0][0];
      expect(update).toEqual({ defaultTopN: null, updatedByAccountId: 'recruiter-1' });
    });
  });
});
