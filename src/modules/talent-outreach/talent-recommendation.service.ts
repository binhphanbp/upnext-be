import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  CandidateContactPreferenceStatus,
  CvStatus,
  JobStatus,
  JobSearchStatus,
  ModerationStatus,
  Prisma,
  ProfileVisibility,
  TalentRecommendationRunStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../cv-screening/embedding.service';
import { GenerateRecommendationsDto } from './dto/generate-recommendations.dto';

@Injectable()
export class TalentRecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  async generate(dto: GenerateRecommendationsDto, user: AuthenticatedUser) {
    this.assertEnabled();
    const job = await this.authorizedJob(dto.jobPostId, user);
    const run = await this.prisma.talentRecommendationRun.create({
      data: {
        companyId: job.companyId,
        jobPostId: job.id,
        requestedByRecruiterId: user.id,
        status: TalentRecommendationRunStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    try {
      const jobEmbedding = await this.embeddings.getOrCreateJobEmbedding(job.id);
      const candidates = await this.prisma.cvEmbedding.findMany({
        where: {
          candidateProfile: {
            jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
            profileVisibility: ProfileVisibility.PUBLIC,
            contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
            applications: { none: { jobPostId: job.id } },
            companyBlocks: { none: { companyId: job.companyId, revokedAt: null } },
          },
          cvVersion: { cv: { status: CvStatus.ACTIVE } },
        },
        include: {
          candidateProfile: {
            select: {
              id: true,
              description: true,
              account: { select: { fullName: true } },
              skills: { select: { skill: { select: { name: true } } }, take: 12 },
            },
          },
        },
      });

      const ranked = candidates
        .map((candidate) => ({
          candidate,
          score: this.embeddings.cosineSimilarity(
            jobEmbedding.vector,
            parseVector(candidate.embeddingVector),
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, dto.limit);

      await this.prisma.$transaction(async (tx) => {
        for (const [index, entry] of ranked.entries()) {
          await tx.talentRecommendation.create({
            data: {
              runId: run.id,
              jobPostId: job.id,
              candidateProfileId: entry.candidate.candidateProfileId,
              score: Math.round(entry.score * 10_000) / 100,
              rank: index + 1,
              scoreBreakdown: { semanticSimilarity: entry.score },
              explanation: 'Semantic similarity between the job post and the candidate CV.',
            },
          });
        }
        await tx.talentRecommendationRun.update({
          where: { id: run.id },
          data: { status: TalentRecommendationRunStatus.COMPLETED, finishedAt: new Date() },
        });
      });

      return this.getRun(run.id, user);
    } catch (error) {
      await this.prisma.talentRecommendationRun.update({
        where: { id: run.id },
        data: {
          status: TalentRecommendationRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async getRun(id: string, user: AuthenticatedUser) {
    this.assertEnabled();
    const run = await this.prisma.talentRecommendationRun.findUnique({
      where: { id },
      include: {
        recommendations: {
          orderBy: { rank: 'asc' },
          include: {
            candidateProfile: {
              select: {
                id: true,
                description: true,
                account: { select: { fullName: true } },
                skills: { select: { skill: { select: { name: true } } }, take: 12 },
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Recommendation run not found');
    if (user.role !== ActorType.RECRUITER || run.companyId !== user.companyId) {
      throw new ForbiddenException('Recommendation run is outside your company');
    }
    return { data: run };
  }

  private async authorizedJob(jobPostId: string, user: AuthenticatedUser) {
    if (
      user.role !== ActorType.RECRUITER ||
      !user.companyId ||
      !user.permissions.some((code) =>
        ['applications:manage', 'applications:review_assigned'].includes(code),
      )
    ) {
      throw new ForbiddenException('Talent recommendation permission required');
    }
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: {
        id: true,
        companyId: true,
        status: true,
        moderationStatus: true,
        isHidden: true,
        deletedAt: true,
        expiredAt: true,
      },
    });
    if (
      !job ||
      job.companyId !== user.companyId ||
      job.status !== JobStatus.PUBLISHED ||
      job.moderationStatus !== ModerationStatus.APPROVED ||
      job.isHidden ||
      job.deletedAt ||
      (job.expiredAt && job.expiredAt <= new Date())
    ) {
      throw new NotFoundException('Active job post not found');
    }
    return job;
  }

  private assertEnabled() {
    if (!this.config.get<boolean>('chatOutreachEnabled')) {
      throw new ServiceUnavailableException('Talent outreach is not enabled');
    }
  }
}

function parseVector(value: Prisma.JsonValue): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
  );
}
