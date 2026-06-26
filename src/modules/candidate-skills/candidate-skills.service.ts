import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateSkillDto } from './dto/create-candidate-skill.dto';
import { UpdateCandidateSkillDto } from './dto/update-candidate-skill.dto';

@Injectable()
export class CandidateSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateSkill.findMany({
      where: { candidateProfileId: profile.id },
      include: { skill: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateSkillDto) {
    const profile = await this.getProfile(candidateAccountId);

    try {
      return await this.prisma.candidateSkill.create({
        data: {
          ...dto,
          candidateProfileId: profile.id,
        },
        include: { skill: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateSkillDto) {
    await this.findOwned(candidateAccountId, id);

    try {
      return await this.prisma.candidateSkill.update({
        where: { id },
        data: dto,
        include: { skill: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(candidateAccountId: string, id: string) {
    await this.findOwned(candidateAccountId, id);
    await this.prisma.candidateSkill.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateSkill.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy kỹ năng');
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
      throw new ConflictException('Kỹ năng đã tồn tại trong hồ sơ này.');
    }

    throw error;
  }
}
