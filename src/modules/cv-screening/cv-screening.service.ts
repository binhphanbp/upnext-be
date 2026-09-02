import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, CvScreeningRunStatus, EducationLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isJobPostAccessibleToRecruiter } from '../../common/authorization/job-post-access';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { RunCvScreeningDto } from './dto/run-cv-screening.dto';
import { EmbeddingService } from './embedding.service';
import {
  estimateGeminiCostVnd,
  GeminiScoringService,
  GeminiScoreResult,
} from './gemini-scoring.service';
import {
  calculateEducationMatchScore,
  EducationMatchScoreResult,
  EducationEvidenceInput,
  extractHighestEducationLevel,
  getEducationLevelLabel,
} from './education-scoring';
import { CV_SCORING_RUBRIC, CvScoringCriterionBreakdown } from './scoring-rubric';
import { buildCvText, buildJobText, CV_TEXT_INCLUDE, JOB_TEXT_INCLUDE } from './screening-text';

// Safety cap so a single run can never fan out to an unbounded number of
// Gemini calls. Every application below this cap is scored -- there is no
// semantic pre-filter, so nothing is silently dropped from a normal run.
const MAX_APPLICATIONS_PER_RUN = 200;
// Was 8. Verified live against the real gateway: an 8-CV batch consistently
// hit the full 90s batch timeout and fell back to scoring each CV one at a
// time (`scoreAndPersistBatch`'s `canFallback` path) -- meaning a "batch of
// 8" run was actually running at fallback concurrency (2, one CV per call)
// almost the whole time, not batch concurrency. A smaller batch is a lighter
// prompt/response that the gateway can answer within the timeout on the
// first try, so runs actually get the parallelism below instead of silently
// degrading to the slow path on every batch.
const GEMINI_BATCH_SIZE = 3;
// Concurrency is a request-shape/rate-limit tradeoff, not an accuracy one:
// each batch is still scored independently with the same rubric/prompt --
// the scoring model tier and batch size (accuracy) are unchanged, only how
// many requests are in flight at once. `withRetry` in GeminiScoringService
// absorbs an occasional 429/timeout from bursty concurrent calls.
const GEMINI_BATCH_CONCURRENCY = 6;
const GEMINI_FALLBACK_CONCURRENCY = 3;
const SCORING_VERSION = 'cv-screening-v11-ai-gateway-vi';
type TerminalCvScreeningRunStatus = Exclude<CvScreeningRunStatus, 'pending' | 'processing'>;

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

type ScreeningCandidate = {
  application: ApplicationForScreening;
  cvText: string;
  candidateEducationLevel: EducationLevel | null;
  candidateEducationEvidence: string | null;
};

@Injectable()
export class CvScreeningService {
  private readonly logger = new Logger(CvScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiScoringService: GeminiScoringService,
    private readonly quota: SubscriptionQuotaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async startRun(recruiterId: string, dto: RunCvScreeningDto) {
    const recruiter = await this.resolveRecruiter(recruiterId);
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: dto.jobPostId },
      select: {
        id: true,
        companyId: true,
        createdByRecruiterId: true,
        accessRevocations: {
          where: { recruiterAccountId: recruiterId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }

    if (jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException('Recruiter does not belong to the company that owns this job');
    }

    if (!isJobPostAccessibleToRecruiter(jobPost, recruiterId)) {
      throw new ForbiddenException('Bạn không có quyền truy cập tin tuyển dụng này.');
    }

    const [applicationCount, applicationPool, companyConfig] = await Promise.all([
      this.prisma.application.count({ where: { jobPostId: dto.jobPostId } }),
      this.prisma.application.findMany({
        where: { jobPostId: dto.jobPostId },
        select: { id: true, cvVersionId: true },
        orderBy: { submittedAt: 'desc' },
        take: MAX_APPLICATIONS_PER_RUN,
      }),
      this.prisma.cvScreeningCompanyConfig.findUnique({
        where: { companyId: recruiter.companyId },
      }),
    ]);

    // `limit` is "Top N" (10/20/...): the recruiter wants only the N CVs
    // closest to the job description AI-scored, not every applicant. Ranking
    // by embedding similarity first (cheap, fast, already computed/cached for
    // other features) and sending only the winners to Gemini's slow, metered
    // scoring is what actually gets a run down to 1-2 minutes -- scoring
    // every CV with the LLM is both the cost and the latency problem, not
    // just a throughput setting. Omitting `limit` (and having no company
    // default) keeps the old "score everyone" behaviour.
    const limit = dto.limit ?? companyConfig?.defaultTopN ?? undefined;
    const applicationIds =
      limit && limit < applicationPool.length
        ? await this.selectTopApplicationsByEmbedding(
            dto.jobPostId,
            applicationPool,
            limit,
            companyConfig?.minSimilarityScore ?? null,
          )
        : applicationPool.map((application) => application.id);
    // Persist the exact application set with the run. A retry must never score
    // a newer applicant simply because the queue was delayed or recovered.
    const totalApplications = applicationIds.length;

    if (applicationCount > totalApplications) {
      this.logger.log(
        `Job post ${dto.jobPostId} has ${applicationCount} applications; this run scores ${totalApplications} (limit=${limit ?? 'none'})`,
      );
    }

    if (totalApplications === 0) {
      throw new BadRequestException('This job post has no applications to screen');
    }

    // The run row and the quota reservation are created together: a run that
    // exceeds the remaining allowance must not exist at all. The reservation is
    // settled (or reversed) by the durable worker when the run reaches a
    // terminal state.
    const run = await this.prisma.$transaction(async (tx) => {
      // Serialise starts for one job post. This protects the check below from
      // two simultaneous HTTP requests both creating an active run. It is
      // transaction-scoped, so a failed request never leaves a stale lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.jobPostId}))`;

      const activeRun = await tx.cvScreeningRun.findFirst({
        where: {
          jobPostId: dto.jobPostId,
          status: { in: [CvScreeningRunStatus.PENDING, CvScreeningRunStatus.PROCESSING] },
        },
        select: { id: true },
      });
      if (activeRun) {
        throw new ConflictException({
          code: 'CV_SCREENING_RUN_IN_PROGRESS',
          message: 'Một lượt sàng lọc CV đang chạy cho tin tuyển dụng này.',
          runId: activeRun.id,
        });
      }

      const created = await tx.cvScreeningRun.create({
        data: {
          jobPostId: dto.jobPostId,
          companyId: recruiter.companyId,
          recruiterAccountId: recruiter.id,
          totalApplications,
          limit: limit ?? null,
          applicationIds,
          status: CvScreeningRunStatus.PENDING,
        },
      });

      // One credit per CV scored, matching how the pricing table counts it
      // ("AI chấm điểm phù hợp CV-JD: N CV/tháng").
      await this.quota.consume(tx, {
        companyId: recruiter.companyId,
        feature: SubscriptionFeature.AI_CV_MATCHING,
        quantity: totalApplications,
        referenceType: 'CV_SCREENING_RUN',
        referenceId: created.id,
        idempotencyKey: `cv-screening:${created.id}`,
        createdByRecruiterId: recruiter.id,
      });

      return created;
    });

    return {
      runId: run.id,
      status: run.status,
    };
  }

  /**
   * Ranks the candidate pool by cosine similarity between the job's and each
   * CV's embedding (`EmbeddingService.rankCvEmbeddings`, pgvector-backed with
   * a JS fallback) and returns just the application ids for the top `limit`.
   * Embedding compute/lookup is cheap and fast compared to a Gemini scoring
   * call, so this is what makes "Top 10/20" both cheaper (fewer AI_CV_MATCHING
   * credits) and faster (fewer, not just more parallel, Gemini calls) than
   * scoring the whole pool.
   *
   * Never blocks a run on embedding trouble: if ranking fails for any reason
   * (embedding provider down, pgvector unavailable and the JS fallback also
   * errors, ...), this falls back to the same "most recent N" selection the
   * service used before embedding pre-filtering existed.
   */
  private async selectTopApplicationsByEmbedding(
    jobPostId: string,
    applicationPool: Array<{ id: string; cvVersionId: string }>,
    limit: number,
    minScore: number | null = null,
  ): Promise<string[]> {
    try {
      const jobEmbedding = await this.embeddingService.getOrCreateJobEmbedding(jobPostId);
      const cvVersionIds = applicationPool.map((application) => application.cvVersionId);
      await this.embeddingService.getOrCreateCvEmbeddings(cvVersionIds);
      const ranked = await this.embeddingService.rankCvEmbeddings(
        jobEmbedding.vector,
        cvVersionIds,
        limit,
        minScore,
      );

      if (ranked.length === 0) {
        this.logger.warn(
          `Embedding ranking returned no results for job ${jobPostId}; falling back to most recent ${limit}`,
        );
        return applicationPool.slice(0, limit).map((application) => application.id);
      }

      const applicationIdByCvVersionId = new Map(
        applicationPool.map((application) => [application.cvVersionId, application.id]),
      );
      return ranked
        .map((item) => applicationIdByCvVersionId.get(item.cvVersionId))
        .filter((applicationId): applicationId is string => Boolean(applicationId));
    } catch (error) {
      this.logger.warn(
        `Embedding pre-filter failed for job ${jobPostId}; falling back to most recent ${limit}`,
        this.getErrorStack(error),
      );
      return applicationPool.slice(0, limit).map((application) => application.id);
    }
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
      status: run.status,
      attemptCount: run.attemptCount,
      nextAttemptAt: run.nextAttemptAt,
      errorMessage: run.errorMessage,
      cancelRequestedAt: run.cancelRequestedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  /**
   * Cancels a run the recruiter no longer wants to wait for.
   *
   * - `PENDING` (worker hasn't claimed it yet): cancel outright and refund the
   *   full quota reservation -- nothing was scored, nothing to keep.
   * - `PROCESSING`: only flag it. The in-flight batch (already billed and
   *   sent to Gemini) is always let to finish and persist, so cancelling
   *   never discards paid work; the worker checks the flag between batches
   *   (`isCancelRequested`) and stops scheduling further ones, then
   *   `finishClaimedRun` settles the run as CANCELLED and refunds only the
   *   CVs never scored.
   * - Idempotent: calling this twice on an already-flagged PROCESSING run
   *   returns the same CANCEL_REQUESTED state instead of erroring.
   */
  async cancelRun(recruiterId: string, runId: string) {
    await this.getAuthorizedRun(recruiterId, runId);

    const cancelledPending = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cvScreeningRun.updateMany({
        where: { id: runId, status: CvScreeningRunStatus.PENDING },
        data: {
          status: CvScreeningRunStatus.CANCELLED,
          cancelRequestedAt: new Date(),
          finishedAt: new Date(),
          errorMessage: 'Đã hủy theo yêu cầu trước khi bắt đầu chấm.',
        },
      });
      if (!claimed.count) return false;

      const reservation = await tx.subscriptionUsage.findUnique({
        where: { idempotencyKey: `cv-screening:${runId}` },
      });
      if (reservation) {
        await this.quota.reverse(tx, reservation.id, 'cv-screening-cancelled');
      }
      return true;
    });
    if (cancelledPending) {
      return { runId, status: CvScreeningRunStatus.CANCELLED };
    }

    const flagged = await this.prisma.cvScreeningRun.updateMany({
      where: { id: runId, status: CvScreeningRunStatus.PROCESSING, cancelRequestedAt: null },
      data: { cancelRequestedAt: new Date() },
    });
    if (flagged.count > 0) {
      return { runId, status: 'CANCEL_REQUESTED' as const };
    }

    const current = await this.prisma.cvScreeningRun.findUnique({ where: { id: runId } });
    if (current?.status === CvScreeningRunStatus.PROCESSING && current.cancelRequestedAt) {
      return { runId, status: 'CANCEL_REQUESTED' as const };
    }

    throw new ConflictException({
      code: 'CV_SCREENING_RUN_NOT_CANCELLABLE',
      message: 'Lượt sàng lọc này đã kết thúc, không thể hủy.',
    });
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

  /**
   * Executes a run that was atomically claimed by CvScreeningWorkerService.
   * The worker identity is required on every terminal transition so an expired
   * worker lease can never overwrite work reclaimed by another process.
   */
  async processClaimedRun(runId: string, workerId: string) {
    const run = await this.prisma.cvScreeningRun.findFirst({
      where: {
        id: runId,
        status: CvScreeningRunStatus.PROCESSING,
        lockedBy: workerId,
      },
    });

    if (!run) {
      throw new ConflictException({
        code: 'CV_SCREENING_LEASE_LOST',
        message: `CV screening run ${runId} is not claimed by this worker`,
      });
    }

    // A reclaimed run may have written some scores before the previous process
    // stopped. Rebuild progress from persisted results, rather than trusting
    // in-memory progress increments from an interrupted attempt.
    const alreadyScored = await this.prisma.applicationAiScore.count({ where: { runId } });
    await this.prisma.cvScreeningRun.updateMany({
      where: {
        id: runId,
        status: CvScreeningRunStatus.PROCESSING,
        lockedBy: workerId,
      },
      data: {
        processedCount: alreadyScored,
        failedCount: 0,
      },
    });

    const renewLeaseTimer = setInterval(() => {
      void this.renewLease(runId, workerId).catch((error: unknown) => {
        this.logger.error(`Failed to renew CV screening lease for run ${runId}`, error);
      });
    }, 60_000);

    // Aborts in-flight Gemini calls the moment a cancel is requested, instead
    // of leaving them to run out their own timeout (90s x 3 retries, ~4.5min
    // worst case). `mapLimit`'s `shouldStop` check below only stops the NEXT
    // batch from starting -- this is what makes an already-dispatched batch
    // actually stop too, so cancelling a slow run feels like seconds, not
    // minutes.
    const cancelAbortController = new AbortController();
    const cancelWatchTimer = setInterval(() => {
      void this.isCancelRequested(runId).then((cancelled) => {
        if (cancelled) cancelAbortController.abort(new Error('CV screening run cancelled'));
      });
    }, 3_000);

    try {
      const effectiveLimit = Math.min(
        run.limit ?? MAX_APPLICATIONS_PER_RUN,
        MAX_APPLICATIONS_PER_RUN,
      );
      const [jobPost, applications, companyConfig] = await Promise.all([
        this.prisma.jobPost.findUnique({
          where: { id: run.jobPostId },
          include: JOB_TEXT_INCLUDE,
        }),
        this.prisma.application.findMany({
          where: {
            jobPostId: run.jobPostId,
            id: { in: this.toStringArray(run.applicationIds) },
          },
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
          orderBy: { submittedAt: 'desc' },
          take: effectiveLimit,
        }),
        this.prisma.cvScreeningCompanyConfig.findUnique({
          where: { companyId: run.companyId },
        }),
      ]);

      if (!jobPost) {
        throw new NotFoundException('Job post not found');
      }

      const jobText = buildJobText(jobPost);
      const customInstructions = companyConfig?.customInstructions ?? null;
      const cvTextByVersionId = await this.loadCvTexts(
        applications.map((application) => application.cvVersionId),
      );

      const selected: ScreeningCandidate[] = [];
      const missingCvTextItems: ApplicationForScreening[] = [];

      for (const application of applications) {
        const cvText = cvTextByVersionId.get(application.cvVersionId)?.trim();
        if (!cvText) {
          missingCvTextItems.push(application);
          continue;
        }

        const candidateEducation = this.resolveCandidateEducation(application);
        selected.push({
          application,
          cvText,
          candidateEducationLevel: candidateEducation?.level ?? null,
          candidateEducationEvidence: candidateEducation?.evidence ?? null,
        });
      }

      if (missingCvTextItems.length > 0) {
        for (const application of missingCvTextItems) {
          this.logger.error(
            `Application ${application.id} has no readable CV text; skipping AI scoring`,
          );
        }
        await this.incrementProgress(runId, missingCvTextItems.length, missingCvTextItems.length);
      }

      const toScore = await this.reuseFreshScores(runId, jobPost.updatedAt, selected);
      await this.mapLimit(
        this.chunk(toScore, GEMINI_BATCH_SIZE),
        GEMINI_BATCH_CONCURRENCY,
        (batch) =>
          this.scoreAndPersistBatch(
            runId,
            jobText,
            jobPost.educationLevel,
            batch,
            true,
            cancelAbortController.signal,
            customInstructions,
          ),
        () => this.isCancelRequested(runId),
      );

      const cancelled = await this.isCancelRequested(runId);
      await this.finishClaimedRun(
        runId,
        workerId,
        cancelled ? CvScreeningRunStatus.CANCELLED : CvScreeningRunStatus.COMPLETED,
      );
    } finally {
      clearInterval(renewLeaseTimer);
      clearInterval(cancelWatchTimer);
    }
  }

  /**
   * Makes the run terminal and settles its quota atomically. A successful run
   * keeps the original reservation. A partial or failed run reverses it, then
   * consumes only the CVs actually scored, leaving a clear auditable ledger.
   */
  async finishClaimedRun(
    runId: string,
    workerId: string,
    status: TerminalCvScreeningRunStatus,
    errorMessage: string | null = null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.cvScreeningRun.findFirst({
        where: {
          id: runId,
          status: CvScreeningRunStatus.PROCESSING,
          lockedBy: workerId,
        },
      });
      if (!run) {
        throw new ConflictException({
          code: 'CV_SCREENING_LEASE_LOST',
          message: `CV screening run ${runId} was reclaimed before it could finish`,
        });
      }

      // `application_ai_scores` is the durable proof of a successfully scored
      // CV. Deriving the final state from it makes recovery idempotent even if
      // a process dies between score persistence and progress-counter updates.
      const successfulCount = await tx.applicationAiScore.count({ where: { runId } });
      // A recruiter-requested cancel takes priority over "partial/failed"
      // framing once anything is genuinely left unscored -- the run stopped
      // on purpose, not because scoring broke. If cancellation raced the last
      // batch finishing, `successfulCount >= totalApplications` still wins:
      // the recruiter gets their completed results, not a cancelled run.
      const finalStatus =
        run.cancelRequestedAt && successfulCount < run.totalApplications
          ? CvScreeningRunStatus.CANCELLED
          : successfulCount >= run.totalApplications
            ? CvScreeningRunStatus.COMPLETED
            : successfulCount === 0
              ? CvScreeningRunStatus.FAILED
              : CvScreeningRunStatus.PARTIAL_FAILED;
      const finalFailedCount = Math.max(0, run.totalApplications - successfulCount);
      let settlementWarning: string | null = null;

      if (status !== finalStatus) {
        this.logger.warn(
          `CV screening run ${runId} requested terminal state ${status}, reconciled to ${finalStatus}`,
        );
      }

      if (finalStatus !== CvScreeningRunStatus.COMPLETED) {
        const reservation = await tx.subscriptionUsage.findUnique({
          where: { idempotencyKey: `cv-screening:${run.id}` },
        });
        if (!reservation) {
          settlementWarning =
            'Không tìm thấy quota reservation để đối soát; đội vận hành cần kiểm tra ledger.';
          this.logger.error(`Quota reservation for CV screening run ${run.id} is missing`);
        } else {
          await this.quota.reverse(tx, reservation.id, `cv-screening-${finalStatus.toLowerCase()}`);

          if (successfulCount > 0) {
            await this.quota.consume(tx, {
              companyId: run.companyId,
              feature: SubscriptionFeature.AI_CV_MATCHING,
              quantity: successfulCount,
              referenceType: 'CV_SCREENING_RUN_FINAL',
              referenceId: run.id,
              idempotencyKey: `cv-screening:${run.id}:settled:${successfulCount}`,
              createdByRecruiterId: run.recruiterAccountId,
            });
          }
        }
      }

      const updated = await tx.cvScreeningRun.updateMany({
        where: {
          id: runId,
          status: CvScreeningRunStatus.PROCESSING,
          lockedBy: workerId,
        },
        data: {
          status: finalStatus,
          processedCount: Math.min(run.totalApplications, successfulCount + finalFailedCount),
          failedCount: finalFailedCount,
          errorMessage:
            finalStatus === CvScreeningRunStatus.COMPLETED
              ? null
              : finalStatus === CvScreeningRunStatus.CANCELLED
                ? (settlementWarning ??
                  `Đã hủy theo yêu cầu. Đã chấm ${successfulCount}/${run.totalApplications} CV trước khi hủy; phần còn lại đã được hoàn lượt.`)
                : (settlementWarning ??
                  errorMessage ??
                  'Một số CV không thể được chấm; quota chưa sử dụng đã được hoàn lại.'),
          finishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: new Date(),
        },
      });
      if (!updated.count) {
        throw new ConflictException({
          code: 'CV_SCREENING_LEASE_LOST',
          message: `CV screening run ${runId} was reclaimed before it could be finalized`,
        });
      }
    });
  }

  private async isCancelRequested(runId: string): Promise<boolean> {
    const run = await this.prisma.cvScreeningRun.findUnique({
      where: { id: runId },
      select: { cancelRequestedAt: true },
    });
    return Boolean(run?.cancelRequestedAt);
  }

  private async renewLease(runId: string, workerId: string) {
    const renewed = await this.prisma.cvScreeningRun.updateMany({
      where: {
        id: runId,
        status: CvScreeningRunStatus.PROCESSING,
        lockedBy: workerId,
      },
      data: { lockedAt: new Date() },
    });
    if (!renewed.count) {
      this.logger.warn(`CV screening worker lost lease for run ${runId}`);
    }
  }

  /**
   * Records what a Gemini call actually cost. The pricing model assumes a margin
   * between plan price and token spend, and this is the only place that number
   * can be measured. Never lets a logging failure abort a scoring run.
   */
  private async recordAiUsage(
    runId: string,
    usage: { inputTokens: number | null; outputTokens: number | null },
    modelName: string,
    succeeded: boolean,
  ) {
    try {
      const run = await this.prisma.cvScreeningRun.findUnique({
        where: { id: runId },
        select: { companyId: true, recruiterAccountId: true },
      });
      if (!run) return;

      await this.prisma.aiUsageLog.create({
        data: {
          feature: SubscriptionFeature.AI_CV_MATCHING,
          companyId: run.companyId,
          actorType: ActorType.RECRUITER,
          actorId: run.recruiterAccountId,
          modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costEstimate: modelName.startsWith('gemini-')
            ? estimateGeminiCostVnd(usage.inputTokens, usage.outputTokens)
            : null,
          referenceType: 'CV_SCREENING_RUN',
          referenceId: runId,
          succeeded,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record AI usage for run ${runId}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Loads the CV text used for AI scoring straight from the CV version.
   * `parsedText` (extracted when the candidate applied) is preferred; otherwise
   * the structured candidate profile is stitched together as a fallback.
   */
  private async loadCvTexts(cvVersionIds: string[]) {
    const uniqueIds = [...new Set(cvVersionIds)];
    const texts = new Map<string, string>();

    if (uniqueIds.length === 0) {
      return texts;
    }

    const cvVersions = await this.prisma.cVVersion.findMany({
      where: { id: { in: uniqueIds } },
      include: CV_TEXT_INCLUDE,
    });

    for (const cvVersion of cvVersions) {
      texts.set(cvVersion.id, buildCvText(cvVersion));
    }

    return texts;
  }

  /**
   * Skips Gemini for applications that already have a score produced by the
   * current scoring version, as long as the job post has not been
   * edited since. CV versions are append-only, so a changed CV means a new
   * cvVersionId and therefore no cached score to reuse.
   */
  private async reuseFreshScores(
    runId: string,
    jobPostUpdatedAt: Date,
    selected: ScreeningCandidate[],
  ) {
    if (selected.length === 0) {
      return selected;
    }

    const existingScores = await this.prisma.applicationAiScore.findMany({
      where: {
        applicationId: { in: selected.map((item) => item.application.id) },
        scoringVersion: SCORING_VERSION,
        updatedAt: { gte: jobPostUpdatedAt },
      },
      select: { applicationId: true, runId: true },
    });

    if (existingScores.length === 0) {
      return selected;
    }

    const reusableFromOtherRun = existingScores.filter((score) => score.runId !== runId);
    const reusableApplicationIds = new Set(existingScores.map((score) => score.applicationId));
    if (reusableFromOtherRun.length > 0) {
      await this.prisma.applicationAiScore.updateMany({
        where: { applicationId: { in: reusableFromOtherRun.map((score) => score.applicationId) } },
        data: { runId },
      });
      await this.incrementProgress(runId, reusableFromOtherRun.length, 0);
    }

    this.logger.log(
      `Reused ${reusableApplicationIds.size} fresh AI score(s) for CV screening run ${runId}`,
    );

    return selected.filter((item) => !reusableApplicationIds.has(item.application.id));
  }

  private async scoreAndPersistBatch(
    runId: string,
    jobText: string,
    requiredEducationLevel: EducationLevel,
    batch: ScreeningCandidate[],
    canFallback = true,
    signal?: AbortSignal,
    customInstructions?: string | null,
  ) {
    if (batch.length === 0) {
      return;
    }

    try {
      const { results, usage, modelName } = await this.geminiScoringService.scoreBatch(
        jobText,
        batch.map((item) => ({
          applicationId: item.application.id,
          cvText: item.cvText,
          candidateEducationLevel: item.candidateEducationLevel,
        })),
        signal,
        customInstructions,
      );
      await this.recordAiUsage(runId, usage, modelName, true);
      const resultByApplicationId = new Map(
        results.map((result) => [result.applicationId, result]),
      );
      const persistOperations: Array<{
        item: ScreeningCandidate;
        operation: Promise<void>;
      }> = [];
      const missingResultItems: ScreeningCandidate[] = [];

      for (const item of batch) {
        const result = resultByApplicationId.get(item.application.id);
        if (!result) {
          this.logger.error(`Gemini response missed application ${item.application.id}`);
          missingResultItems.push(item);
          continue;
        }

        persistOperations.push({
          item,
          operation: this.persistScore(runId, item, result, requiredEducationLevel, modelName),
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
          signal,
          customInstructions,
        );
      }
    } catch (error) {
      if (signal?.aborted) {
        // Recruiter-requested cancel, not a real failure -- no ERROR log
        // noise, no per-CV fallback retry (that would just abort again
        // immediately against the same signal). These CVs are simply left
        // unscored; `finishClaimedRun` refunds the credit for each one.
        this.logger.log(
          `CV screening run ${runId} cancelled mid-batch; leaving ${batch.length} CV(s) unscored`,
        );
        await this.incrementProgress(runId, batch.length, batch.length);
        return;
      }

      if (canFallback && batch.length > 1) {
        this.logger.warn(
          `Scoring batch of ${batch.length} CVs failed; retrying each CV separately`,
          this.getErrorStack(error),
        );
        await this.mapLimit(batch, GEMINI_FALLBACK_CONCURRENCY, (item) =>
          this.scoreAndPersistBatch(
            runId,
            jobText,
            requiredEducationLevel,
            [item],
            false,
            signal,
            customInstructions,
          ),
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
    missingItems: ScreeningCandidate[],
    canFallback: boolean,
    signal?: AbortSignal,
    customInstructions?: string | null,
  ) {
    if (canFallback && missingItems.length > 0) {
      this.logger.warn(
        `Gemini missed ${missingItems.length} application(s); retrying each CV separately`,
      );
      await this.mapLimit(missingItems, GEMINI_FALLBACK_CONCURRENCY, (item) =>
        this.scoreAndPersistBatch(
          runId,
          jobText,
          requiredEducationLevel,
          [item],
          false,
          signal,
          customInstructions,
        ),
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
    item: ScreeningCandidate,
    result: GeminiScoreResult,
    requiredEducationLevel: EducationLevel,
    modelName: string,
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
      modelName,
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
            createdByRecruiterId: true,
            accessRevocations: {
              where: { recruiterAccountId: recruiterId },
              select: { id: true },
              take: 1,
            },
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

    // Đây là cửa duy nhất tới CV và điểm AI của ứng viên, nên quyền theo từng tin phải chặn ở đây.
    if (!isJobPostAccessibleToRecruiter(application.jobPost, recruiterId)) {
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

  /**
   * @param shouldStop Checked before each item is dispatched (not mid-item --
   *   an in-flight Gemini call is always let to finish and persist its
   *   result, so a cancel never throws away work already paid for). Once it
   *   returns true, no worker starts another item; already-dispatched items
   *   still run to completion.
   */
  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
    shouldStop?: () => Promise<boolean>,
  ) {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    let stopped = false;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        if (stopped) return;
        if (shouldStop && (await shouldStop())) {
          stopped = true;
          return;
        }
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
