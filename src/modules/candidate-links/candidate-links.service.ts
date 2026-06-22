import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateLinkDto } from './dto/create-candidate-link.dto';
import { UpdateCandidateLinkDto } from './dto/update-candidate-link.dto';

@Injectable()
export class CandidateLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateLink.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateLinkDto) {
    const profile = await this.getProfile(candidateAccountId);

    try {
      return await this.prisma.candidateLink.create({
        data: {
          ...dto,
          candidateProfileId: profile.id,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateLinkDto) {
    await this.findOwned(candidateAccountId, id);

    try {
      return await this.prisma.candidateLink.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(candidateAccountId: string, id: string) {
    await this.findOwned(candidateAccountId, id);
    await this.prisma.candidateLink.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateLink.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy liên kết');
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

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Liên kết đã tồn tại trong hồ sơ này.');
    }

    throw error;
  }
}
