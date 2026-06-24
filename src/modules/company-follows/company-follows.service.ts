import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CompanyFollowsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');
    return profile;
  }

  async followCompany(candidateAccountId: string, companyId: string) {
    const profile = await this.getProfile(candidateAccountId);

    const existing = await this.prisma.companyFollow.findUnique({
      where: {
        candidateProfileId_companyId: {
          candidateProfileId: profile.id,
          companyId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Already following this company');
    }

    return this.prisma.companyFollow.create({
      data: {
        candidateProfileId: profile.id,
        companyId,
      },
    });
  }

  async unfollowCompany(candidateAccountId: string, companyId: string) {
    const profile = await this.getProfile(candidateAccountId);

    try {
      await this.prisma.companyFollow.delete({
        where: {
          candidateProfileId_companyId: {
            candidateProfileId: profile.id,
            companyId,
          },
        },
      });
    } catch {
      throw new NotFoundException('Follow record not found');
    }
  }

  async listFollowingCompanies(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);

    return this.prisma.companyFollow.findMany({
      where: { candidateProfileId: profile.id },
      include: {
        company: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
