import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateProjectDto } from './dto/create-candidate-project.dto';
import { UpdateCandidateProjectDto } from './dto/update-candidate-project.dto';

@Injectable()
export class CandidateProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateProject.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateProjectDto) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateProject.create({
      data: {
        ...dto,
        candidateProfileId: profile.id,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateProjectDto) {
    await this.findOwned(candidateAccountId, id);
    return this.prisma.candidateProject.update({
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
    await this.prisma.candidateProject.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateProject.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy dự án');
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
