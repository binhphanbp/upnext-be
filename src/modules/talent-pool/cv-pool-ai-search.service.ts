import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobSearchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../cv-screening/embedding.service';
import { buildLegacyContactEligibilityWhere } from '../candidate-profile/candidate-eligibility';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { computeExperienceYears, formatExpectedSalary } from './talent-pool.service';

/**
 * AI lọc Kho CV theo một Job Post -- paid-only.
 *
 * ## Tái dùng hạ tầng cv-screening, KHÔNG tái dùng bucket quota của nó
 *
 * `getOrCreateJobEmbedding()` và `rankCvEmbeddings()` đã tồn tại và đã chạy
 * production cho việc chấm CV của ứng viên **đã nộp đơn**. Đây là cùng một khả
 * năng AI (so một JD với các CV), chỉ khác TẬP ứng viên đầu vào (toàn bộ Kho
 * CV, không phải applicant của một tin), nên tái dùng thẳng thay vì dựng lại
 * embedding pipeline.
 *
 * Nhưng feature quota là `CV_POOL_AI_SEARCH`, KHÔNG phải `AI_CV_MATCHING` --
 * hai bucket khác nhau, xem doc comment của `CV_POOL_AI_SEARCH` trong
 * `feature-registry.ts`. Trộn chung sẽ làm một recruiter lọc Kho CV hết lượt
 * vì đồng nghiệp vừa chấm CV ứng viên, hoặc ngược lại.
 *
 * ## Vì sao cap kích thước tập trước khi gọi `rankCvEmbeddings()`
 *
 * `rankCvEmbeddings()` rơi vào fallback JS cosine (không `LIMIT`, không cap)
 * bất cứ khi nào câu SQL pgvector ném lỗi -- đúng tình huống của máy dev hiện
 * tại (không cài được pgvector). Với tập input là TOÀN BỘ Kho CV (có thể tới
 * hàng nghìn hồ sơ), fallback đó sẽ nạp toàn bộ embedding vào Node. Không sửa
 * `EmbeddingService` (dùng chung với cv-screening, ngoài phạm vi hiện tại) --
 * chặn ở phía gọi bằng cùng ngưỡng Discovery đã dùng.
 *
 * ## Bug đã sửa: phải GET-OR-CREATE embedding CV, không chỉ ĐỌC
 *
 * Bản trước chỉ `this.prisma.cvEmbedding.findMany(...)` -- một read thuần.
 * Không nơi nào khác trong repo từng gọi `EmbeddingService.getOrCreateCvEmbeddings()`
 * (cv-screening chấm CV bằng `GeminiScoringService`, không dùng embedding), nên
 * bảng `cv_embeddings` luôn RỖNG và tính năng luôn trả `{ data: [] }` cho mọi
 * JD, mọi công ty -- xác nhận trực tiếp trên DB thật: `cvEmbeddingCount = 0`
 * trong khi 178 ứng viên đủ điều kiện đều có CV mặc định. Giờ gọi
 * `getOrCreateCvEmbeddings()` (cùng cơ chế "get-or-create" đã dùng cho job ở
 * `getOrCreateJobEmbedding()`) để tạo embedding còn thiếu trước khi rank. Chi
 * phí tạo là MỘT LẦN mỗi CV version (khoá theo `cvVersionId`, dùng chung cho
 * mọi công ty tra cứu sau này) -- lần lọc đầu tiên sẽ chậm hơn vì phải tạo
 * embedding cho cả tập ứng viên, các lần sau gần như tức thời (cache hit).
 */
const FALLBACK_MAX_CANDIDATES = 2_000;
const EMBEDDING_CREATE_CONCURRENCY = 10;

@Injectable()
export class CvPoolAiSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  async search(companyId: string, jobPostId: string, idempotencyKey: string, limit = 20) {
    // Gate TRƯỚC mọi việc tốn kém -- không phí một lời gọi embedding cho một
    // công ty chưa mua gói.
    await this.quota.assertFeatureEnabled(companyId, SubscriptionFeature.CV_POOL_AI_SEARCH);

    const eligible = await this.prisma.candidateProfile.findMany({
      where: buildLegacyContactEligibilityWhere({ companyId }),
      select: { id: true },
      take: FALLBACK_MAX_CANDIDATES + 1,
    });
    if (eligible.length > FALLBACK_MAX_CANDIDATES) {
      throw new ServiceUnavailableException({
        code: 'CV_POOL_AI_SEARCH_UNAVAILABLE',
        message: 'Kho CV hiện quá lớn để lọc bằng AI. Vui lòng thử lại sau.',
      });
    }
    if (!eligible.length) {
      return { data: [] };
    }

    // Lấy CV MẶC ĐỊNH, phiên bản mới nhất của mỗi ứng viên đủ điều kiện -- cùng
    // predicate với `loadCvSourceFile()` ở `talent-pool.service.ts`. Ứng viên
    // không có CV file (chỉ CV Builder chưa xuất bản, hoặc chưa từng đặt CV mặc
    // định) không có gì để embed nên bị loại tự nhiên ở bước này.
    const cvsWithLatestVersion = await this.prisma.cV.findMany({
      where: { candidateProfileId: { in: eligible.map((row) => row.id) }, isDefault: true },
      select: {
        candidateProfileId: true,
        versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { id: true } },
      },
    });

    const cvVersionIdByCandidateProfileId = new Map<string, string>();
    for (const cv of cvsWithLatestVersion) {
      const versionId = cv.versions[0]?.id;
      if (versionId) cvVersionIdByCandidateProfileId.set(cv.candidateProfileId, versionId);
    }
    if (!cvVersionIdByCandidateProfileId.size) {
      return { data: [] };
    }

    // GET-OR-CREATE, không phải đọc thuần: xem doc comment ở đầu file -- không
    // nơi nào khác từng gọi hàm này cho CV nên `cv_embeddings` luôn rỗng trước
    // khi có sửa này. Đây là chi phí một lần cho mỗi CV version, dùng chung cho
    // mọi công ty tra cứu sau.
    const embeddingByCvVersionId = await this.embeddings.getOrCreateCvEmbeddings(
      [...cvVersionIdByCandidateProfileId.values()],
      EMBEDDING_CREATE_CONCURRENCY,
    );

    const candidateByCvVersion = new Map(
      [...cvVersionIdByCandidateProfileId.entries()]
        .filter(([, cvVersionId]) => embeddingByCvVersionId.has(cvVersionId))
        .map(([candidateProfileId, cvVersionId]) => [cvVersionId, candidateProfileId]),
    );
    if (!candidateByCvVersion.size) {
      return { data: [] };
    }

    const jobEmbedding = await this.embeddings.getOrCreateJobEmbedding(jobPostId);
    const ranked = await this.embeddings.rankCvEmbeddings(
      jobEmbedding.vector,
      [...candidateByCvVersion.keys()],
      limit,
      null,
    );
    if (!ranked.length) {
      // Không charge một lượt lọc ra 0 kết quả -- khác với Discovery (nơi §1
      // nói rõ "một lượt = một snapshot, không hứa có kết quả"), đây là một
      // hành động tìm kiếm đơn giản mà việc trả rỗng thường là do JD/Kho CV
      // chưa khớp gì, chưa xứng đáng tính phí như một sản phẩm hoàn chỉnh.
      return { data: [] };
    }

    await this.quota.consume(this.prisma, {
      companyId,
      feature: SubscriptionFeature.CV_POOL_AI_SEARCH,
      referenceType: 'CV_POOL_AI_SEARCH',
      referenceId: randomUUID(),
      idempotencyKey,
    });

    const candidateProfileIds = ranked
      .map((row) => candidateByCvVersion.get(row.cvVersionId))
      .filter((id): id is string => Boolean(id));

    const profiles = await this.prisma.candidateProfile.findMany({
      where: { id: { in: candidateProfileIds } },
      select: {
        id: true,
        description: true,
        preferredSearchCity: true,
        updatedAt: true,
        jobSearchStatus: true,
        account: { select: { fullName: true } },
        skills: {
          select: { skill: { select: { id: true, name: true } }, yearsOfExperience: true },
          take: 10,
        },
        experiences: {
          select: {
            positionTitle: true,
            companyName: true,
            isCurrent: true,
            startDate: true,
            endDate: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
        },
        jobPreference: {
          select: { desiredSalaryMin: true, desiredSalaryMax: true, salaryCurrency: true },
        },
        cvs: {
          where: { isDefault: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    return {
      data: ranked
        .map((row) => {
          const candidateProfileId = candidateByCvVersion.get(row.cvVersionId);
          const profile = candidateProfileId ? profileById.get(candidateProfileId) : undefined;
          if (!candidateProfileId || !profile) return null;
          return {
            candidateProfileId,
            fullName: profile.account.fullName,
            headline: profile.experiences[0]?.positionTitle ?? null,
            currentCompany: profile.experiences[0]?.isCurrent
              ? profile.experiences[0].companyName
              : null,
            description: profile.description,
            city: profile.preferredSearchCity,
            skills: profile.skills.map((skillRow) => skillRow.skill),
            matchScore: Math.round(row.semanticScore),
            updatedAt: profile.updatedAt.toISOString(),
            experienceYears: computeExperienceYears(profile.experiences, profile.skills),
            expectedSalary: formatExpectedSalary(profile.jobPreference),
            hasCv: profile.cvs.length > 0,
            viewedThisPeriod: false,
            avatarUrl: `https://i.pravatar.cc/150?u=${profile.id}`,
            isOpenToWork: profile.jobSearchStatus === JobSearchStatus.OPEN_TO_WORK,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };
  }

  async assertJobPostOwnedByCompany(companyId: string, jobPostId: string): Promise<void> {
    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobPostId, companyId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException({ code: 'JOB_POST_NOT_FOUND', message: 'Job post not found' });
    }
  }
}
