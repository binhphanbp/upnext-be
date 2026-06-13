import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateShortlistDto } from './dto/create-shortlist.dto';

@Injectable()
export class RecruiterShortlistsService {
  constructor(private readonly prisma: PrismaService) {}

  async addToShortlist(recruiterAccountId: string, dto: CreateShortlistDto) {
    const existing = await this.prisma.recruiterCandidateShortlist.findFirst({
      where: {
        recruiterAccountId,
        candidateProfileId: dto.candidateProfileId,
        jobPostId: dto.jobPostId ?? null,
      },
    });

    if (existing) {
      throw new ConflictException('Candidate already in shortlist');
    }

    return this.prisma.recruiterCandidateShortlist.create({
      data: {
        recruiterAccountId,
        candidateProfileId: dto.candidateProfileId,
        jobPostId: dto.jobPostId ?? null,
        priority: dto.priority ?? 0,
        note: dto.note,
      },
      include: {
        candidateProfile: true,
        jobPost: true,
      },
    });
  }

  async removeFromShortlist(shortlistId: string, recruiterAccountId: string) {
    const record = await this.prisma.recruiterCandidateShortlist.findUnique({
      where: { id: shortlistId },
    });

    if (!record) throw new NotFoundException('Shortlist record not found');
    if (record.recruiterAccountId !== recruiterAccountId) {
      throw new NotFoundException('Shortlist record not found');
    }

    await this.prisma.recruiterCandidateShortlist.delete({
      where: { id: shortlistId },
    });
  }

  async listShortlist(recruiterAccountId: string) {
    return this.prisma.recruiterCandidateShortlist.findMany({
      where: { recruiterAccountId },
      include: {
        candidateProfile: true,
        jobPost: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
