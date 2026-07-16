import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CvScreeningRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RunCvScreeningDto } from './dto/run-cv-screening.dto';
import { EmbeddingResult, EmbeddingService } from './embedding.service';
import { GeminiScoringService, GeminiScoreResult } from './gemini-scoring.service';

const DEFAULT_DETAILED_LIMIT = 100;
const MAX_DETAILED_LIMIT = 200;
const EMBEDDING_CONCURRENCY = 8;
const GEMINI_BATCH_SIZE = 8;
const GEMINI_BATCH_CONCURRENCY = 1;
const GEMINI_FALLBACK_CONCURRENCY = 1;
const SCORING_VERSION = 'cv-screening-v5-json-cosine-vi';

type ApplicationForScreening = Prisma.ApplicationGetPayload<{
  select: {
    id: true;
    jobPostId: true;
    candidateProfileId: true;
    cvVersionId: true;
    candidateProfile: {
      select: {
        account: { select: { fullName: true; email: true } };
      };
    };
  };
}>;

type RankedApplication = {
  application: ApplicationForScreening;
  semanticScore: number;
  cvText: string;
  cvEmbeddingUpdatedAt: Date;
};

@Injectable()
export class CvScreeningService {
  private readonly logger = new Logger(CvScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly geminiScoringService: GeminiScoringService,
  ) {}

  async startRun(recruiterId: string, dto: RunCvScreeningDto) {
    const recruiter = await this.resolveRecruiter(recruiterId);
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: dto.jobPostId },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }

    if (jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException('Recruiter does not belong to the company that owns this job');
    }

    const totalApplications = await this.prisma.application.count({
      where: { jobPostId: dto.jobPostId },
    });

    const run = await this.prisma.cvScreeningRun.create({
      data: {
        jobPostId: dto.jobPostId,
        companyId: recruiter.companyId,
        recruiterAccountId: recruiter.id,
        totalApplications,
        limit: dto.limit ?? null,
        minScore: dto.minScore ?? null,
        status: CvScreeningRunStatus.PENDING,
      },
    });

    setImmediate(() => {
      void this.processRun(run.id).catch((error: unknown) => {
        this.logger.error(`Unhandled CV screening run ${run.id} error`, this.getErrorStack(error));
      });
    });

    return {
      runId: run.id,
      status: run.status,
    };
  }

  async getRun(recruiterId: string, runId: string) {
    const run = await this.getAuthorizedRun(recruiterId, runId);

    return {
      id: run.id,
      jobPostId: run.jobPostId,
      companyId: run.companyId,
      recruiterAccountId: run.recruiterAccountId,
      totalApplications: run.totalApplications,
      processedCount: run.processedCount,
      failedCount: run.failedCount,
      limit: run.limit,
      minScore: run.minScore === null ? null : Number(run.minScore),
      status: run.status,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  async getResults(recruiterId: string, runId: string) {
    await this.getAuthorizedRun(recruiterId, runId);

    const scores = await this.prisma.applicationAiScore.findMany({
      where: { runId },
      include: {
        application: {
          include: {
            cvVersion: {
              include: {
                sourceFile: true,
              },
            },
          },
        },
        candidateProfile: {
          include: {
            account: { select: { fullName: true, email: true } },
          },
        },
        jobPost: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { finalScore: 'desc' },
    });

    return scores.map((score) => ({
      applicationId: score.applicationId,
      candidateName: score.candidateProfile.account.fullName,
      jobTitle: score.jobPost.title,
      finalScore: Number(score.finalScore),
      semanticScore: Number(score.semanticScore),
      aiScore: Number(score.aiScore),
      skillScore: Number(score.skillScore),
      experienceScore: Number(score.experienceScore),
      projectScore: Number(score.projectScore),
      educationScore: Number(score.educationScore),
      matchedSkills: this.toStringArray(score.matchedSkills),
      missingSkills: this.toStringArray(score.missingSkills),
      summary: score.summary,
      recommendation: this.toVietnameseRecommendation(score.recommendation),
      cvFileUrl:
        score.application.cvVersion.sourceFile?.publicUrl ??
        `/api/recruiter/applications/${score.applicationId}/cv`,
    }));
  }

  async getApplicationAiScore(recruiterId: string, applicationId: string) {
    await this.ensureRecruiterCanAccessApplication(recruiterId, applicationId);

    const score = await this.prisma.applicationAiScore.findUnique({
      where: { applicationId },
      include: {
        run: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!score) {
      throw new NotFoundException('AI score not found for this application');
    }

    return {
      id: score.id,
      runId: score.runId,
      applicationId: score.applicationId,
      finalScore: Number(score.finalScore),
      semanticScore: Number(score.semanticScore),
      aiScore: Number(score.aiScore),
      skillScore: Number(score.skillScore),
      experienceScore: Number(score.experienceScore),
      projectScore: Number(score.projectScore),
      educationScore: Number(score.educationScore),
      strengths: this.toStringArray(score.strengths),
      weaknesses: this.toStringArray(score.weaknesses),
      summary: score.summary,
      recommendation: this.toVietnameseRecommendation(score.recommendation),
      matchedSkills: this.toStringArray(score.matchedSkills),
      missingSkills: this.toStringArray(score.missingSkills),
      modelName: score.modelName,
      scoringVersion: score.scoringVersion,
      run: score.run,
      createdAt: score.createdAt,
      updatedAt: score.updatedAt,
    };
  }

  async getAuthorizedApplicationCvVersionId(recruiterId: string, applicationId: string) {
    const application = await this.ensureRecruiterCanAccessApplication(recruiterId, applicationId);
    return application.cvVersionId;
  }

  private async processRun(runId: string) {
    const run = await this.prisma.cvScreeningRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      this.logger.warn(`CV screening run ${runId} not found`);
      return;
    }

    await this.prisma.cvScreeningRun.update({
      where: { id: runId },
      data: {
        status: CvScreeningRunStatus.PROCESSING,
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    try {
      const [jobEmbedding, applications] = await Promise.all([
        this.embeddingService.getOrCreateJobEmbedding(run.jobPostId),
        this.prisma.application.findMany({
          where: { jobPostId: run.jobPostId },
          select: {
            id: true,
            jobPostId: true,
            candidateProfileId: true,
            cvVersionId: true,
            candidateProfile: {
              select: {
                account: { select: { fullName: true, email: true } },
              },
            },
          },
          orderBy: { submittedAt: 'asc' },
        }),
      ]);

      const cvEmbeddings = await this.embeddingService.getOrCreateCvEmbeddings(
        applications.map((application) => application.cvVersionId),
        EMBEDDING_CONCURRENCY,
      );
      let embeddingFailureCount = 0;
      const ranked = applications.map((application): RankedApplication | null => {
        const cvEmbedding = cvEmbeddings.get(application.cvVersionId);
        if (!cvEmbedding) {
          this.logger.error(`Failed to create embedding for application ${application.id}`);
          embeddingFailureCount += 1;
          return null;
        }

        const similarity = this.embeddingService.cosineSimilarity(
          jobEmbedding.vector,
          cvEmbedding.vector,
        );
        const semanticScore = this.roundScore(similarity * 100);

        return {
          application,
          semanticScore,
          cvText: cvEmbedding.text,
          cvEmbeddingUpdatedAt: cvEmbedding.updatedAt,
        };
      });

      if (embeddingFailureCount > 0) {
        await this.incrementProgress(runId, 0, embeddingFailureCount);
      }

      const minScore = run.minScore === null ? null : Number(run.minScore);
      const requestedLimit = run.limit ?? DEFAULT_DETAILED_LIMIT;
      const detailLimit = Math.min(requestedLimit, MAX_DETAILED_LIMIT, applications.length);
      const selected = ranked
        .filter((item): item is RankedApplication => item !== null)
        .filter((item) => minScore === null || item.semanticScore >= minScore)
        .sort((left, right) => right.semanticScore - left.semanticScore)
        .slice(0, detailLimit);

      const toScore = await this.reuseFreshScores(runId, jobEmbedding, selected);
      await this.mapLimit(
        this.chunk(toScore, GEMINI_BATCH_SIZE),
        GEMINI_BATCH_CONCURRENCY,
        (batch) => this.scoreAndPersistBatch(runId, jobEmbedding.text, batch),
      );

      const latestRun = await this.prisma.cvScreeningRun.findUnique({
        where: { id: runId },
        select: { failedCount: true },
      });

      await this.prisma.cvScreeningRun.update({
        where: { id: runId },
        data: {
          status:
            latestRun && latestRun.failedCount > 0
              ? CvScreeningRunStatus.PARTIAL_FAILED
              : CvScreeningRunStatus.COMPLETED,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`CV screening run ${runId} failed`, this.getErrorStack(error));

      const latestRun = await this.prisma.cvScreeningRun.findUnique({
        where: { id: runId },
        select: { processedCount: true, failedCount: true },
      });

      await this.prisma.cvScreeningRun.update({
        where: { id: runId },
        data: {
          status:
            latestRun && (latestRun.processedCount > 0 || latestRun.failedCount > 0)
              ? CvScreeningRunStatus.PARTIAL_FAILED
              : CvScreeningRunStatus.FAILED,
          errorMessage: this.getErrorMessage(error),
          finishedAt: new Date(),
        },
      });
    }
  }

  private async reuseFreshScores(
    runId: string,
    jobEmbedding: EmbeddingResult,
    selected: RankedApplication[],
  ) {
    if (selected.length === 0) {
      return selected;
    }

    const selectedByApplicationId = new Map(selected.map((item) => [item.application.id, item]));
    const existingScores = await this.prisma.applicationAiScore.findMany({
      where: {
        applicationId: { in: selected.map((item) => item.application.id) },
        modelName: this.geminiScoringService.modelName,
        scoringVersion: SCORING_VERSION,
      },
      select: {
        applicationId: true,
        aiScore: true,
        updatedAt: true,
      },
    });
    const reusableScores: Array<{
      item: RankedApplication;
      score: (typeof existingScores)[number];
    }> = [];

    for (const score of existingScores) {
      const item = selectedByApplicationId.get(score.applicationId);
      if (!item) {
        continue;
      }

      const scoreUpdatedAt = score.updatedAt.getTime();
      if (
        scoreUpdatedAt >= jobEmbedding.updatedAt.getTime() &&
        scoreUpdatedAt >= item.cvEmbeddingUpdatedAt.getTime()
      ) {
        reusableScores.push({ item, score });
      }
    }

    if (reusableScores.length === 0) {
      return selected;
    }

    await Promise.all(
      reusableScores.map(({ item, score }) =>
        this.prisma.applicationAiScore.update({
          where: { applicationId: item.application.id },
          data: {
            runId,
            semanticScore: item.semanticScore,
            finalScore: this.roundScore(Number(score.aiScore) * 0.7 + item.semanticScore * 0.3),
          },
        }),
      ),
    );
    await this.incrementProgress(runId, reusableScores.length, 0);

    const reusableApplicationIds = new Set(reusableScores.map(({ item }) => item.application.id));
    this.logger.log(
      `Reused ${reusableScores.length} fresh AI score(s) for CV screening run ${runId}`,
    );

    return selected.filter((item) => !reusableApplicationIds.has(item.application.id));
  }

  private async scoreAndPersistBatch(
    runId: string,
    jobText: string,
    batch: RankedApplication[],
    canFallback = true,
  ) {
    if (batch.length === 0) {
      return;
    }

    try {
      const results = await this.geminiScoringService.scoreBatch(
        jobText,
        batch.map((item) => ({
          applicationId: item.application.id,
          candidateName: item.application.candidateProfile.account.fullName,
          cvText: item.cvText,
          semanticScore: item.semanticScore,
        })),
      );
      const resultByApplicationId = new Map(
        results.map((result) => [result.applicationId, result]),
      );
      const persistOperations: Array<{
        item: RankedApplication;
        operation: Promise<void>;
      }> = [];
      const missingResultItems: RankedApplication[] = [];

      for (const item of batch) {
        const result = resultByApplicationId.get(item.application.id);
        if (!result) {
          this.logger.error(`Gemini response missed application ${item.application.id}`);
          missingResultItems.push(item);
          continue;
        }

        persistOperations.push({
          item,
          operation: this.persistScore(runId, item, result),
        });
      }

      const persistedResults = await Promise.allSettled(
        persistOperations.map(({ operation }) => operation),
      );
      const persistFailureCount = persistedResults.filter(
        (result) => result.status === 'rejected',
      ).length;

      persistedResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `Failed to persist AI score for application ${persistOperations[index].item.application.id}`,
            this.getErrorStack(result.reason),
          );
        }
      });

      await this.incrementProgress(runId, persistOperations.length, persistFailureCount);

      if (missingResultItems.length > 0) {
        await this.retryMissingScores(runId, jobText, missingResultItems, canFallback);
      }
    } catch (error) {
      if (canFallback && batch.length > 1) {
        this.logger.warn(
          `Scoring batch of ${batch.length} CVs failed; retrying each CV separately`,
          this.getErrorStack(error),
        );
        await this.mapLimit(batch, GEMINI_FALLBACK_CONCURRENCY, (item) =>
          this.scoreAndPersistBatch(runId, jobText, [item], false),
        );
        return;
      }

      for (const item of batch) {
        this.logger.error(
          `Failed to score application ${item.application.id}`,
          this.getErrorStack(error),
        );
      }
      await this.incrementProgress(runId, batch.length, batch.length);
    }
  }

  private async retryMissingScores(
    runId: string,
    jobText: string,
    missingItems: RankedApplication[],
    canFallback: boolean,
  ) {
    if (canFallback && missingItems.length > 0) {
      this.logger.warn(
        `Gemini missed ${missingItems.length} application(s); retrying each CV separately`,
      );
      await this.mapLimit(missingItems, GEMINI_FALLBACK_CONCURRENCY, (item) =>
        this.scoreAndPersistBatch(runId, jobText, [item], false),
      );
      return;
    }

    for (const item of missingItems) {
      this.logger.error(`Gemini response missed application ${item.application.id}`);
    }
    await this.incrementProgress(runId, missingItems.length, missingItems.length);
  }

  private async persistScore(runId: string, item: RankedApplication, result: GeminiScoreResult) {
    const skillScore = this.roundScore(result.skillScore);
    const experienceScore = this.roundScore(result.experienceScore);
    const projectScore = this.roundScore(result.projectScore);
    const educationScore = this.roundScore(result.educationScore);
    const aiScore = this.roundScore(skillScore + experienceScore + projectScore + educationScore);
    const finalScore = this.roundScore(aiScore * 0.7 + item.semanticScore * 0.3);

    const data = {
      runId,
      jobPostId: item.application.jobPostId,
      candidateProfileId: item.application.candidateProfileId,
      semanticScore: item.semanticScore,
      aiScore,
      finalScore,
      skillScore,
      experienceScore,
      projectScore,
      educationScore,
      matchedSkills: result.matchedSkills as Prisma.InputJsonValue,
      missingSkills: result.missingSkills as Prisma.InputJsonValue,
      strengths: result.strengths as Prisma.InputJsonValue,
      weaknesses: result.weaknesses as Prisma.InputJsonValue,
      summary: result.summary,
      recommendation: result.recommendation,
      rawAiResponse: result.raw as Prisma.InputJsonValue,
      modelName: this.geminiScoringService.modelName,
      scoringVersion: SCORING_VERSION,
    };

    await this.prisma.applicationAiScore.upsert({
      where: { applicationId: item.application.id },
      update: data,
      create: {
        applicationId: item.application.id,
        ...data,
      },
    });
  }

  private async incrementProgress(runId: string, processedDelta: number, failedDelta: number) {
    await this.prisma.cvScreeningRun.update({
      where: { id: runId },
      data: {
        processedCount: { increment: processedDelta },
        failedCount: { increment: failedDelta },
      },
    });
  }

  private async resolveRecruiter(recruiterId: string) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }

    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    return {
      id: recruiter.id,
      companyId: recruiter.companyId,
    };
  }

  private async getAuthorizedRun(recruiterId: string, runId: string) {
    const recruiter = await this.resolveRecruiter(recruiterId);
    const run = await this.prisma.cvScreeningRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException('CV screening run not found');
    }

    if (run.companyId !== recruiter.companyId) {
      throw new ForbiddenException('You are not authorized to access this CV screening run');
    }

    return run;
  }

  private async ensureRecruiterCanAccessApplication(recruiterId: string, applicationId: string) {
    const recruiter = await this.resolveRecruiter(recruiterId);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        jobPost: {
          select: {
            companyId: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException('You are not authorized to access this application');
    }

    return application;
  }

  private roundScore(value: number) {
    return Math.round(value * 100) / 100;
  }

  private toStringArray(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toVietnameseRecommendation(value: string | null) {
    switch (value) {
      case 'strong_fit':
        return 'Rất phù hợp';
      case 'fit':
        return 'Phù hợp';
      case 'borderline':
        return 'Cần cân nhắc';
      case 'not_fit':
        return 'Không phù hợp';
      default:
        return value ? 'Cần cân nhắc' : null;
    }
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown) {
    return error instanceof Error ? error.stack : undefined;
  }
}
