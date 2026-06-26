import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateExperienceDto } from './dto/create-candidate-experience.dto';
import { UpdateCandidateExperienceDto } from './dto/update-candidate-experience.dto';

@Injectable()
export class CandidateExperiencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateExperience.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateExperienceDto) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateExperience.create({
      data: {
        ...dto,
        candidateProfileId: profile.id,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateExperienceDto) {
    await this.findOwned(candidateAccountId, id);
    return this.prisma.candidateExperience.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async remove(candidateAccountId: string, id: string) {
    await this.findOwned(candidateAccountId, id);
    await this.prisma.candidateExperience.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateExperience.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy kinh nghiệm');
    }

    return record;
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
