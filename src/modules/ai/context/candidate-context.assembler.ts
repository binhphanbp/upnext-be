import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildCvText } from '../../cv-screening/screening-text';
import { MIN_RELEVANCE_SCORE, rankJobs } from '../matching/job-ranker';
import { anonymizeSelf, coarsenAddress, redact } from './pii-redactor';

/**
 * Lấy dữ liệu nghiệp vụ cho Copilot và trả về **DTO thuần**.
 *
 * ADR-001 §5.4: logic AI không bao giờ nhận `PrismaTransactionClient`. Mọi thứ
 * vào model đi qua đây, nên đây là chỗ duy nhất quyết định model được thấy gì —
 * và do đó là chỗ duy nhất phải lọc PII (§16.4).
 *
 * Hai tính chất phải giữ khi sửa file này:
 *
 * 1. **Mọi hàm nhận `candidateProfileId` của người đang đăng nhập và tự kiểm
 *    quyền.** Không nhận cờ "đã kiểm rồi" từ caller. Tool registry gọi trực tiếp
 *    vào đây nên đây là điểm chặn cuối, không phải điểm chặn thứ hai.
 * 2. **Không trả về object Prisma.** Trả object mới với đúng field cần thiết.
 *    Spread một entity Prisma vào response là cách PII lọt ra mà không ai thấy.
 */

export type CandidateProfileContext = {
  desiredPosition: string | null;
  city: string | null;
  workingModel: string | null;
  yearsTotal: number | null;
  isOpenToWork: boolean;
  skills: { name: string; level: string; years: number | null }[];
  experiences: {
    positionTitle: string;
    companyName: string;
    months: number | null;
    technologies: string | null;
    summary: string | null;
  }[];
};

export type CvVersionContext = {
  cvVersionId: string;
  cvName: string;
  versionNo: number;
  /** Đã lọc PII và ẩn danh tên. */
  parsedText: string;
  hasStructuredContent: boolean;
};

export type JobPostContext = {
  jobPostId: string;
  slug: string;
  title: string;
  companyName: string;
  city: string | null;
  workingModel: string | null;
  salaryLabel: string | null;
  requiredSkills: { name: string; minYears: number | null }[];
  niceToHaveSkills: { name: string }[];
  /** Mô tả và yêu cầu, đã lọc PII (JD do người dùng khác nhập — không tin cậy). */
  description: string;
  requirements: string;
};

export type ApplicationContext = {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  status: string;
  submittedAt: string;
  lastChangeAt: string | null;
};

const MAX_CV_TEXT = 8_000;
const MAX_JD_TEXT = 4_000;

/**
 * Pool để xếp hạng. 60 đủ rộng để một tin hợp không lọt khỏi lát cắt, đủ hẹp để
 * một truy vấn không kéo nửa bảng. Chấm điểm chạy trong bộ nhớ nên chi phí thật
 * nằm ở kích thước pool, không ở số tin trả về.
 */
const JOB_POOL_SIZE = 60;

/**
 * §11.2 hard filter — tin đang thực sự mở.
 *
 * Là hàm chứ không phải hằng: `expiredAt > now` phải lấy thời điểm hiện tại lúc
 * gọi. Một hằng module-level sẽ đóng băng `new Date()` ở thời điểm import, và
 * sau vài giờ chạy sẽ bắt đầu trả về tin đã hết hạn.
 */
function openJobFilter(): Prisma.JobPostWhereInput {
  return {
    status: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    deletedAt: null,
    isHidden: false,
    OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
  };
}

const JOB_CONTEXT_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  requirements: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryIsNegotiable: true,
  salaryIsVisible: true,
  company: { select: { name: true } },
  jobPostSkills: {
    select: { priority: true, minYearsExperience: true, skill: { select: { name: true } } },
  },
  jobPostLocations: {
    take: 1,
    select: { jobLocation: { select: { workingModel: true, city: true } } },
  },
} satisfies Prisma.JobPostSelect;

/**
 * Suy ra từ chính `JOB_CONTEXT_SELECT` thay vì khai tay.
 *
 * Kiểu viết tay sẽ lệch âm thầm mỗi lần ai đó thêm một field vào select, và
 * TypeScript không báo gì vì object vẫn thoả kiểu rộng hơn.
 */
type JobRow = Prisma.JobPostGetPayload<{ select: typeof JOB_CONTEXT_SELECT }>;

/** Một chỗ duy nhất đổi hàng Prisma thành DTO — gồm cả bước lọc PII của JD. */
function toJobContext(job: JobRow): JobPostContext {
  const location = job.jobPostLocations[0]?.jobLocation;
  return {
    jobPostId: job.id,
    slug: job.slug,
    title: job.title,
    companyName: job.company.name,
    city: location?.city ?? null,
    workingModel: location?.workingModel ?? null,
    salaryLabel: formatSalary(job),
    requiredSkills: job.jobPostSkills
      .filter((entry) => entry.priority === 'REQUIRED')
      .map((entry) => ({
        name: entry.skill.name,
        minYears: entry.minYearsExperience ? Number(entry.minYearsExperience) : null,
      })),
    niceToHaveSkills: job.jobPostSkills
      .filter((entry) => entry.priority !== 'REQUIRED')
      .map((entry) => ({ name: entry.skill.name })),
    // JD do nhà tuyển dụng nhập → dữ liệu không đáng tin cậy, vẫn phải lọc.
    description: redact(job.description).text.slice(0, MAX_JD_TEXT),
    requirements: redact(job.requirements).text.slice(0, MAX_JD_TEXT),
  };
}

@Injectable()
export class CandidateContextAssembler {
  private readonly logger = new Logger(CandidateContextAssembler.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Đổi id tài khoản đăng nhập thành candidateProfileId. */
  async resolveProfileId(candidateAccountId: string): Promise<string> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Chưa có hồ sơ ứng viên cho tài khoản này');
    return profile.id;
  }

  async profile(candidateProfileId: string): Promise<CandidateProfileContext> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: {
        address: true,
        preferredSearchCity: true,
        jobSearchStatus: true,
        jobPreference: {
          select: { desiredPosition: true, workingModel: true },
        },
        skills: {
          orderBy: { sortOrder: 'asc' },
          take: 40,
          select: {
            proficiencyLevel: true,
            yearsOfExperience: true,
            skill: { select: { name: true } },
          },
        },
        experiences: {
          orderBy: { sortOrder: 'asc' },
          take: 10,
          select: {
            positionTitle: true,
            companyName: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
            technologies: true,
            description: true,
          },
        },
      },
    });

    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ ứng viên');

    const experiences = profile.experiences.map((experience) => ({
      positionTitle: experience.positionTitle,
      companyName: experience.companyName,
      months: monthsBetween(
        experience.startDate,
        experience.isCurrent ? new Date() : experience.endDate,
      ),
      technologies: experience.technologies,
      // Mô tả kinh nghiệm là văn bản tự do người dùng nhập → phải lọc.
      summary: experience.description ? redact(experience.description).text.slice(0, 500) : null,
    }));

    const yearsTotal = experiences.reduce((total, item) => total + (item.months ?? 0), 0) / 12;

    return {
      desiredPosition: profile.jobPreference?.desiredPosition ?? null,
      // Ưu tiên thành phố đã chuẩn hoá; nếu không có thì lấy phần cuối của địa chỉ.
      city: profile.preferredSearchCity ?? coarsenAddress(profile.address),
      workingModel: profile.jobPreference?.workingModel ?? null,
      yearsTotal: yearsTotal > 0 ? Math.round(yearsTotal * 10) / 10 : null,
      isOpenToWork: profile.jobSearchStatus === 'OPEN_TO_WORK',
      skills: profile.skills.map((entry) => ({
        name: entry.skill.name,
        level: entry.proficiencyLevel,
        years: entry.yearsOfExperience ? Number(entry.yearsOfExperience) : null,
      })),
      experiences,
    };
  }

  /**
   * CV đang hoạt động, hoặc một version cụ thể.
   *
   * Kiểm quyền: version phải thuộc một CV của chính ứng viên này. Không có
   * đường nào đọc CV của người khác kể cả khi biết id — điều kiện
   * `cv.candidateProfileId` nằm trong `where`, không phải kiểm sau khi đọc.
   */
  async cvVersion(
    candidateProfileId: string,
    cvVersionId?: string | null,
  ): Promise<CvVersionContext> {
    const version = await this.prisma.cVVersion.findFirst({
      where: {
        ...(cvVersionId ? { id: cvVersionId } : {}),
        cv: { candidateProfileId },
      },
      orderBy: cvVersionId ? undefined : [{ createdAt: 'desc' }],
      select: {
        id: true,
        versionNo: true,
        parsedText: true,
        contentJson: true,
        sourceFile: { select: { originalName: true } },
        cv: {
          select: {
            title: true,
            candidateProfile: {
              select: {
                account: { select: { fullName: true, email: true } },
                description: true,
                skills: { include: { skill: true }, orderBy: { sortOrder: 'asc' } },
                experiences: { orderBy: { sortOrder: 'asc' } },
                projects: { orderBy: { sortOrder: 'asc' } },
                educations: { orderBy: { sortOrder: 'asc' } },
                certifications: { orderBy: { sortOrder: 'asc' } },
                jobPreference: true,
              },
            },
          },
        },
      },
    });

    if (!version) {
      throw cvVersionId
        ? new ForbiddenException('CV này không thuộc tài khoản của bạn')
        : new NotFoundException('Bạn chưa có CV nào');
    }

    const fullName = version.cv.candidateProfile?.account?.fullName ?? null;
    // `buildCvText` đã có sẵn ở cv-screening cho đúng bài toán này: parsedText
    // rỗng khi CV chỉ là file PDF tải lên chưa từng được bóc tách (upload không
    // tự OCR) — trước đây Copilot đọc thẳng `parsedText`, không có phương án dự
    // phòng, nên báo nhầm "CV chưa có nội dung" dù hồ sơ ứng viên có đủ kinh
    // nghiệm/kỹ năng đã điền tay. Dùng lại đúng logic ưu tiên parsedText, sập về
    // hồ sơ có cấu trúc khi rỗng — thay vì viết lại một bản khác dễ lệch nhau.
    const cvText = buildCvText(version as Parameters<typeof buildCvText>[0]);
    const redaction = redact(cvText);
    if (redaction.removed.emails || redaction.removed.phones) {
      this.logger.debug(
        `Đã ẩn ${redaction.removed.emails} email và ${redaction.removed.phones} số điện thoại khỏi CV ${version.id}`,
      );
    }

    return {
      cvVersionId: version.id,
      cvName: version.cv.title,
      versionNo: version.versionNo,
      parsedText: anonymizeSelf(fullName, redaction.text).slice(0, MAX_CV_TEXT),
      hasStructuredContent: version.contentJson !== null,
    };
  }

  /**
   * Tin tuyển dụng — chỉ tin đang công khai.
   *
   * Hard filter theo §11.2: PUBLISHED, đã được kiểm duyệt, chưa xoá, chưa hết
   * hạn. Ứng viên không được đọc tin nháp hay tin đang chờ duyệt qua Copilot.
   */
  async jobPost(jobPostIdOrSlug: string): Promise<JobPostContext> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      jobPostIdOrSlug,
    );

    const job = await this.prisma.jobPost.findFirst({
      where: {
        ...(isUuid ? { id: jobPostIdOrSlug } : { slug: jobPostIdOrSlug }),
        ...openJobFilter(),
      },
      select: JOB_CONTEXT_SELECT,
    });

    if (!job) throw new NotFoundException('Không tìm thấy tin tuyển dụng đang mở');
    return toJobContext(job);
  }

  /** Đã lưu tin này chưa — dùng để không đề xuất lưu thứ đã lưu. */
  async isJobSaved(candidateProfileId: string, jobPostId: string): Promise<boolean> {
    const saved = await this.prisma.savedJob.findUnique({
      where: { candidateProfileId_jobPostId: { candidateProfileId, jobPostId } },
      select: { id: true },
    });
    return saved !== null;
  }

  /** Đơn ứng tuyển của chính ứng viên. */
  async applications(candidateProfileId: string, limit = 10): Promise<ApplicationContext[]> {
    const applications = await this.prisma.application.findMany({
      where: { candidateProfileId },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        updatedAt: true,
        jobPost: { select: { title: true, company: { select: { name: true } } } },
      },
    });

    return applications.map((application) => ({
      applicationId: application.id,
      jobTitle: application.jobPost.title,
      companyName: application.jobPost.company.name,
      status: application.status,
      submittedAt: application.submittedAt.toISOString(),
      lastChangeAt:
        application.updatedAt.getTime() === application.submittedAt.getTime()
          ? null
          : application.updatedAt.toISOString(),
    }));
  }

  /**
   * Việc làm ứng viên có thể quan tâm.
   *
   * Cố ý **không** chấm điểm ở đây. §11.1 nói rõ LLM không được tự trả về một
   * con số phần trăm; điểm phù hợp là việc của thuật toán matching. Hàm này chỉ
   * lọc theo nguyện vọng và trả danh sách để model *giải thích*, không để chấm.
   */
  async candidateJobs(candidateProfileId: string, limit = 3): Promise<JobPostContext[]> {
    const profile = await this.profile(candidateProfileId);
    const skillNames = profile.skills.map((skill) => skill.name);

    // Hồ sơ chưa khai kỹ năng nào thì không có gì để chấm. Trả rỗng để Copilot
    // nói "hãy bổ sung kỹ năng" thay vì gợi ý bừa các tin mới đăng.
    if (!skillNames.length) return [];

    /**
     * Lấy pool rộng rồi mới chấm, thay vì lấy đúng `limit` tin mới nhất rồi chấm.
     *
     * `orderBy publishedAt` giờ chỉ để pool ổn định giữa các lần chạy — điều kiện
     * "cùng đầu vào cùng đầu ra" ở §22 tuần 5. Nó KHÔNG còn quyết định thứ tự
     * hiển thị; việc đó thuộc về `rankJobs`.
     */
    const pool = await this.prisma.jobPost.findMany({
      where: {
        ...openJobFilter(),
        jobPostSkills: { some: { skill: { name: { in: skillNames } } } },
      },
      orderBy: { publishedAt: 'desc' },
      take: JOB_POOL_SIZE,
      select: JOB_CONTEXT_SELECT,
    });

    const ranked = rankJobs(
      {
        skills: profile.skills.map((skill) => ({ name: skill.name, years: skill.years })),
        city: profile.city,
        workingModel: profile.workingModel,
      },
      pool.map(toJobContext),
      limit,
    );

    if (!ranked.length && pool.length) {
      this.logger.debug(
        `Pool ${pool.length} tin nhưng không tin nào đạt ngưỡng ${MIN_RELEVANCE_SCORE} điểm`,
      );
    }

    return ranked.map((entry) => entry.job);
  }
}

function monthsBetween(start: Date | null, end: Date | null): number | null {
  if (!start) return null;
  const finish = end ?? new Date();
  const months =
    (finish.getFullYear() - start.getFullYear()) * 12 + (finish.getMonth() - start.getMonth());
  return months > 0 ? months : null;
}

function formatSalary(job: {
  salaryMin: unknown;
  salaryMax: unknown;
  salaryCurrency: string;
  salaryIsNegotiable: boolean;
  salaryIsVisible: boolean;
}): string | null {
  // Nhà tuyển dụng tắt hiển thị lương thì Copilot cũng không được tiết lộ.
  if (!job.salaryIsVisible) return null;
  if (job.salaryIsNegotiable) return 'Thỏa thuận';

  const min = job.salaryMin ? Number(job.salaryMin) : null;
  const max = job.salaryMax ? Number(job.salaryMax) : null;
  if (!min && !max) return null;

  const millions = (value: number) => `${Math.round(value / 1_000_000)} triệu`;
  if (min && max) return `${millions(min)} – ${millions(max)}`;
  return min ? `Từ ${millions(min)}` : `Tới ${millions(max as number)}`;
}
