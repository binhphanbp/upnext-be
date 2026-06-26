import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCandidateJobPreferenceDto } from './dto/upsert-candidate-job-preference.dto';

@Injectable()
export class CandidateJobPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateJobPreference.findUnique({
      where: { candidateProfileId: profile.id },
      include: { desiredLevel: true },
    });
  }

  async upsertMe(candidateAccountId: string, dto: UpsertCandidateJobPreferenceDto) {
    const profile = await this.getProfile(candidateAccountId);

    return this.prisma.candidateJobPreference.upsert({
      where: { candidateProfileId: profile.id },
      create: {
        ...dto,
        candidateProfileId: profile.id,
      },
      update: dto,
      include: { desiredLevel: true },
    });
  }

  private async getProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ');
    }

    return profile;
  }
}
