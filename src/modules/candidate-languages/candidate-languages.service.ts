import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateLanguageDto } from './dto/create-candidate-language.dto';
import { UpdateCandidateLanguageDto } from './dto/update-candidate-language.dto';

@Injectable()
export class CandidateLanguagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.candidateLanguage.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ language: 'asc' }],
    });
  }

  async create(candidateAccountId: string, dto: CreateCandidateLanguageDto) {
    const profile = await this.getProfile(candidateAccountId);

    try {
      return await this.prisma.candidateLanguage.create({
        data: {
          ...dto,
          candidateProfileId: profile.id,
        },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(candidateAccountId: string, id: string, dto: UpdateCandidateLanguageDto) {
    await this.findOwned(candidateAccountId, id);

    try {
      return await this.prisma.candidateLanguage.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(candidateAccountId: string, id: string) {
    await this.findOwned(candidateAccountId, id);
    await this.prisma.candidateLanguage.delete({ where: { id } });
  }

  private async findOwned(candidateAccountId: string, id: string) {
    const profile = await this.getProfile(candidateAccountId);
    const record = await this.prisma.candidateLanguage.findFirst({
      where: { id, candidateProfileId: profile.id },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy ngôn ngữ');
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
      throw new ConflictException('Ngôn ngữ đã tồn tại trong hồ sơ này.');
    }

    throw error;
  }
}
