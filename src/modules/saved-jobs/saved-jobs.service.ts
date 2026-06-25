import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SaveJobDto } from './dto/save-job.dto';

@Injectable()
export class SavedJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveJob(candidateAccountId: string, dto: SaveJobDto) {
    const profile = await this.getProfile(candidateAccountId);

    const existing = await this.prisma.savedJob.findUnique({
      where: {
        candidateProfileId_jobPostId: {
          candidateProfileId: profile.id,
          jobPostId: dto.jobPostId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Job already saved');
    }

    return this.prisma.savedJob.create({
      data: {
        candidateProfileId: profile.id,
        jobPostId: dto.jobPostId,
      },
    });
  }

  async unsaveJob(candidateAccountId: string, jobPostId: string) {
    const profile = await this.getProfile(candidateAccountId);
    
    try {
      await this.prisma.savedJob.delete({
        where: {
          candidateProfileId_jobPostId: {
            candidateProfileId: profile.id,
            jobPostId,
          },
        },
      });
    } catch {
      throw new NotFoundException('Saved job not found');
    }
  }

  async listSavedJobs(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    
    return this.prisma.savedJob.findMany({
      where: { candidateProfileId: profile.id },
      include: {
        jobPost: {
          include: {
            company: true,
            jobCategory: true,
            employmentType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getProfile(accountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: accountId },
    });

    if (!profile) {
      throw new NotFoundException(`Candidate profile for account ${accountId} not found`);
    }

    return profile;
  }
}
