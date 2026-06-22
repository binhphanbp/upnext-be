import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateCertificationDto } from './dto/create-candidate-certification.dto';
import { UpdateCandidateCertificationDto } from './dto/update-candidate-certification.dto';

@Injectable()
export class CandidateCertificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateCertification.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ sortOrder: 'asc' }, { issuedDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateCertificationDto) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateCertification.create({
      data: {
        ...dto,
        candidateProfileId: profile.id,
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : undefined,
        expiredDate: dto.expiredDate ? new Date(dto.expiredDate) : undefined,
      },
    });
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateCertificationDto) {
    await this.findOwned(candidateAccountId, id);
    return this.prisma.candidateCertification.update({
      where: { id },
      data: {
        ...dto,
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : undefined,
        expiredDate: dto.expiredDate ? new Date(dto.expiredDate) : undefined,
      },
    });
  }

  async remove(candidateAccountId: string, id: string) {
    await this.findOwned(candidateAccountId, id);
    await this.prisma.candidateCertification.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateCertification.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Candidate certification not found');
    }

    return record;
  }

  private async getProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return profile;
  }
}
