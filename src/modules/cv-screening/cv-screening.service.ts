import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CvScreeningRunStatus, EducationLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RunCvScreeningDto } from './dto/run-cv-screening.dto';
import { EmbeddingResult, EmbeddingService } from './embedding.service';
import { GeminiScoringService, GeminiScoreResult } from './gemini-scoring.service';
import {
  calculateEducationMatchScore,
  EducationMatchScoreResult,
  EducationEvidenceInput,
  extractHighestEducationLevel,
  getEducationLevelLabel,
} from './education-scoring';
import { CV_SCORING_RUBRIC, CvScoringCriterionBreakdown } from './scoring-rubric';

const DEFAULT_DETAILED_LIMIT = 100;
const MAX_DETAILED_LIMIT = 200;
const EMBEDDING_CONCURRENCY = 8;
const GEMINI_BATCH_SIZE = 8;
const GEMINI_BATCH_CONCURRENCY = 1;
const GEMINI_FALLBACK_CONCURRENCY = 1;
const SCORING_VERSION = 'cv-screening-v9-impact-evidence-vi';

type ApplicationForScreening = Prisma.ApplicationGetPayload<{
  select: {
    id: true;
    jobPostId: true;
    candidateProfileId: true;
    cvVersionId: true;
    candidateProfile: {
      select: {
        account: { select: { fullName: true; email: true } };
        educations: {
          select: {
            degree: true;
            schoolName: true;
          };
        };
      };
    };
    cvVersion: {
      select: {
        contentJson: true;
        parsedText: true;
      };
    };
  };
}>;

type RankedApplication = {
  application: ApplicationForScreening;
  semanticScore: number;
  cvText: string;
  cvEmbeddingUpdatedAt: Date;
  candidateEducationLevel: EducationLevel | null;
  candidateEducationEvidence: string | null;
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
        candidateProfile: {
          select: { account: { select: { fullName: true } } },
        },
        jobPost: { select: { title: true } },
        application: {
          select: {
            status: true,
            cvVersion: {
              select: { sourceFile: { select: { publicUrl: true } } },
            },
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
      status: score.application.status,
      candidateName: score.candidateProfile.account.fullName,
      jobTitle: score.jobPost.title,
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
      criteriaBreakdown: this.toCriteriaBreakdown(score.rawAiResponse),
      evaluationRubric: CV_SCORING_RUBRIC,
      cvFileUrl:
        score.application.cvVersion.sourceFile?.publicUrl ??
        `/api/recruiter/applications/${score.applicationId}/cv`,
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
      const [jobEmbedding, applications, jobPost] = await Promise.all([
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
                educations: {
                  select: {
                    degree: true,
                    schoolName: true,
                  },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            cvVersion: {
              select: {
                contentJson: true,
                parsedText: true,
              },
            },
          },
          orderBy: { submittedAt: 'asc' },
        }),
        this.prisma.jobPost.findUnique({
          where: { id: run.jobPostId },
          select: { educationLevel: true },
        }),
      ]);

      if (!jobPost) {
        throw new NotFoundException('Job post not found');
      }

      const cvEmbeddings = await this.embeddingService.getOrCreateCvEmbeddings(
        applications.map((application) => application.cvVersionId),
        EMBEDDING_CONCURRENCY,
      );
      const embeddingFailureCount = applications.length - cvEmbeddings.size;

      if (embeddingFailureCount > 0) {
        await this.incrementProgress(runId, 0, embeddingFailureCount);
      }

      const minScore = run.minScore === null ? null : Number(run.minScore);
      const requestedLimit = run.limit ?? DEFAULT_DETAILED_LIMIT;
      const detailLimit = Math.min(requestedLimit, MAX_DETAILED_LIMIT, applications.length);
      const rankedEmbeddings = await this.embeddingService.rankCvEmbeddings(
        jobEmbedding.vector,
        applications.map((application) => application.cvVersionId),
        detailLimit,
        minScore,
      );
      const applicationByCvVersionId = new Map(
        applications.map((application) => [application.cvVersionId, application]),
      );
      const selected = rankedEmbeddings.flatMap((embedding): RankedApplication[] => {
        const application = applicationByCvVersionId.get(embedding.cvVersionId);
        if (!application) {
          return [];
        }
        const candidateEducation = this.resolveCandidateEducation(application);

        return [
          {
            application,
            semanticScore: this.roundScore(embedding.semanticScore),
            cvText: embedding.text,
            cvEmbeddingUpdatedAt: embedding.updatedAt,
            candidateEducationLevel: candidateEducation?.level ?? null,
            candidateEducationEvidence: candidateEducation?.evidence ?? null,
          },
        ];
      });

      const toScore = await this.reuseFreshScores(runId, jobEmbedding, selected);
      await this.mapLimit(
        this.chunk(toScore, GEMINI_BATCH_SIZE),
        GEMINI_BATCH_CONCURRENCY,
        (batch) =>
          this.scoreAndPersistBatch(runId, jobEmbedding.text, jobPost.educationLevel, batch),
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
            finalScore: this.roundScore(Number(score.aiScore)),
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
    requiredEducationLevel: EducationLevel,
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
          candidateEducationLevel: item.candidateEducationLevel,
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
          operation: this.persistScore(runId, item, result, requiredEducationLevel),
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
        await this.retryMissingScores(
          runId,
          jobText,
          requiredEducationLevel,
          missingResultItems,
          canFallback,
        );
      }
    } catch (error) {
      if (canFallback && batch.length > 1) {
        this.logger.warn(
          `Scoring batch of ${batch.length} CVs failed; retrying each CV separately`,
          this.getErrorStack(error),
        );
        await this.mapLimit(batch, GEMINI_FALLBACK_CONCURRENCY, (item) =>
          this.scoreAndPersistBatch(runId, jobText, requiredEducationLevel, [item], false),
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
    requiredEducationLevel: EducationLevel,
    missingItems: RankedApplication[],
    canFallback: boolean,
  ) {
    if (canFallback && missingItems.length > 0) {
      this.logger.warn(
        `Gemini missed ${missingItems.length} application(s); retrying each CV separately`,
      );
      await this.mapLimit(missingItems, GEMINI_FALLBACK_CONCURRENCY, (item) =>
        this.scoreAndPersistBatch(runId, jobText, requiredEducationLevel, [item], false),
      );
      return;
    }

    for (const item of missingItems) {
      this.logger.error(`Gemini response missed application ${item.application.id}`);
    }
    await this.incrementProgress(runId, missingItems.length, missingItems.length);
  }

  private async persistScore(
    runId: string,
    item: RankedApplication,
    result: GeminiScoreResult,
    requiredEducationLevel: EducationLevel,
  ) {
    const skillScore = this.roundScore(result.skillScore);
    const experienceScore = this.roundScore(result.experienceScore);
    const projectScore = this.roundScore(result.projectScore);
    const candidateEducationLevel = item.candidateEducationLevel ?? result.candidateEducationLevel;
    const educationMatch = calculateEducationMatchScore(
      candidateEducationLevel,
      requiredEducationLevel,
    );
    const educationScore = educationMatch.score;
    const aiScore = this.roundScore(skillScore + experienceScore + projectScore + educationScore);
    const finalScore = aiScore;
    const educationBreakdown = this.buildEducationBreakdown(
      educationMatch,
      item.candidateEducationEvidence ??
        (result.candidateEducationLevel
          ? `CV ghi nhận trình độ học vấn: ${getEducationLevelLabel(result.candidateEducationLevel)}.`
          : null),
    );
    const criteriaBreakdown = [...result.criteriaBreakdown, educationBreakdown];
    const rawAiResponse = {
      ...(this.isRecord(result.raw) ? result.raw : {}),
      criteriaBreakdown,
      candidateEducationLevel: educationMatch.candidateLevel,
      requiredEducationLevel: educationMatch.requiredLevel,
    };

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
      recommendation: this.recommendationForScore(finalScore),
      rawAiResponse: rawAiResponse as Prisma.InputJsonValue,
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

  private resolveCandidateEducation(application: ApplicationForScreening) {
    const structuredInputs: EducationEvidenceInput[] = application.candidateProfile.educations.map(
      (education) => ({
        text: education.degree,
        evidence: education.degree
          ? `Hồ sơ ứng viên ghi nhận: ${education.degree}${
              education.schoolName ? ` tại ${education.schoolName}` : ''
            }.`
          : null,
      }),
    );

    structuredInputs.push(...this.getCvContentEducationInputs(application.cvVersion.contentJson));
    const structuredLevel = extractHighestEducationLevel(structuredInputs);
    if (structuredLevel) {
      return structuredLevel;
    }

    return extractHighestEducationLevel([
      {
        text: application.cvVersion.parsedText,
      },
    ]);
  }

  private getCvContentEducationInputs(value: Prisma.JsonValue | null): EducationEvidenceInput[] {
    if (!this.isRecord(value) || !Array.isArray(value.educations)) {
      return [];
    }

    return value.educations.flatMap((education): EducationEvidenceInput[] => {
      if (!this.isRecord(education) || typeof education.degree !== 'string') {
        return [];
      }

      const schoolName =
        typeof education.schoolName === 'string' ? education.schoolName.trim() : '';
      return [
        {
          text: education.degree,
          evidence: `CV ghi nhận: ${education.degree}${schoolName ? ` tại ${schoolName}` : ''}.`,
        },
      ];
    });
  }

  private buildEducationBreakdown(
    match: EducationMatchScoreResult,
    candidateEvidence: string | null,
  ): CvScoringCriterionBreakdown {
    const evidence =
      match.requiredLevel === null
        ? 'Ứng viên không bị giới hạn bởi tiêu chí học vấn.'
        : match.candidateLevel === null
          ? null
          : candidateEvidence;

    return {
      key: 'education',
      summary: this.educationSummary(match),
      items: [
        {
          key: 'education-level-match',
          awardedScore: match.score,
          reason: match.reason,
          evidence,
          candidateEducationLevel: match.candidateLevel,
          requiredEducationLevel: match.requiredLevel,
          difference: match.difference,
        },
      ],
    };
  }

  private educationSummary(match: EducationMatchScoreResult) {
    if (match.requiredLevel === null) {
      return 'Tin tuyển dụng không giới hạn trình độ học vấn của ứng viên.';
    }
    if (match.candidateLevel === null) {
      return 'Hồ sơ ứng viên chưa cung cấp thông tin học vấn để đối chiếu.';
    }
    if (match.score === 10) {
      return 'Ứng viên đáp ứng hoặc cao hơn yêu cầu học vấn của vị trí.';
    }
    return `Ứng viên thấp hơn yêu cầu học vấn ${match.difference} bậc.`;
  }

  private recommendationForScore(score: number) {
    if (score >= 85) return 'strong_fit';
    if (score >= 70) return 'fit';
    if (score >= 50) return 'borderline';
    return 'not_fit';
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

  private toCriteriaBreakdown(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }

    const criteriaBreakdown = value.criteriaBreakdown;
    return Array.isArray(criteriaBreakdown) ? criteriaBreakdown : [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
