import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';

@Injectable()
export class CandidateProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      include: {
        account: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ ứng viên');
    }

    return profile;
  }

  async updateMe(candidateAccountId: string, dto: UpdateCandidateProfileDto) {
    await this.findMe(candidateAccountId);

    return this.prisma.candidateProfile.update({
      where: { candidateAccountId },
      data: {
        ...dto,
        birthdate: dto.birthdate ? new Date(dto.birthdate) : undefined,
      },
      include: {
        account: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }
}
