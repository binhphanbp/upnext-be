import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { isJobPostAccessibleToRecruiter } from '../../common/authorization/job-post-access';
import { UpdateCvScreeningConfigDto } from './dto/update-cv-screening-config.dto';
import {
  assertValidWeights,
  describeInheritance,
  normalizeCriteriaInput,
  resolveScreeningConfig,
  ScreeningConfigRow,
  ScoringWeights,
} from './screening-config.resolver';

export type CvScreeningConfigResponse = {
  scope: 'COMPANY' | 'JOB_POST';
  jobPostId: string | null;
  weights: ScoringWeights;
  weightPreset: string | null;
  mustHaveCriteria: string[];
  niceToHaveCriteria: string[];
  customPrompt: string | null;
  passingScore: number | null;
  defaultTopN: number | null;
  /** Which fields a job-scoped config is still inheriting from the company
   * defaults, so the UI can label them instead of pretending they were set
   * for this job. Always all-false for the company scope. */
  inherited: Record<string, boolean>;
  updatedByAccountId: string | null;
  updatedAt: Date | null;
};

/** The write shape shared by both config tables. Only the keys the caller
 * actually sent are present, so an `upsert` can use it for both `create` and
 * `update` without resetting untouched fields. */
type ScreeningConfigWriteData = {
  updatedByAccountId: string;
  weightSkills?: number;
  weightExperience?: number;
  weightProjects?: number;
  weightEducation?: number;
  weightPreset?: string | null;
  mustHaveCriteria?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  niceToHaveCriteria?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  customPrompt?: string | null;
  passingScore?: number | null;
  defaultTopN?: number | null;
};

const NO_INHERITANCE: Record<string, boolean> = {
  weights: false,
  mustHaveCriteria: false,
  niceToHaveCriteria: false,
  customPrompt: false,
  passingScore: false,
  defaultTopN: false,
};

@Injectable()
export class CvScreeningConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Readable by any team member -- the "AI lọc CV" screen pre-fills its
   * default Top-N and weights from this for everyone, not just whoever can
   * edit it. */
  async getConfig(recruiterId: string): Promise<CvScreeningConfigResponse> {
    const companyId = await this.resolveCompanyId(recruiterId);
    const config = await this.prisma.cvScreeningCompanyConfig.findUnique({
      where: { companyId },
    });

    return this.toResponse('COMPANY', null, resolveScreeningConfig(config), NO_INHERITANCE, config);
  }

  /**
   * Company-wide defaults. Writable only by a recruiter with
   * `company:manage` -- this changes AI prompt behaviour, ranking and the
   * quota-billed shortlist size for every job the company runs.
   */
  async updateConfig(
    user: AuthenticatedUser,
    dto: UpdateCvScreeningConfigDto,
  ): Promise<CvScreeningConfigResponse> {
    if (!user.permissions.includes('company:manage')) {
      throw new ForbiddenException(
        'Chỉ quản trị viên công ty mới có quyền chỉnh cấu hình AI lọc CV của công ty.',
      );
    }
    const companyId = await this.resolveCompanyId(user.id);
    const data = this.buildWriteData(dto, user.id);

    const config = await this.prisma.cvScreeningCompanyConfig.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });

    return this.toResponse('COMPANY', null, resolveScreeningConfig(config), NO_INHERITANCE, config);
  }

  /**
   * Per-job override, merged over the company defaults. Gated by the same
   * per-job access check that gates running a screening (company match +
   * `isJobPostAccessibleToRecruiter`) rather than `company:manage`: whoever
   * may screen a job may tune how that job is screened.
   */
  async getJobConfig(recruiterId: string, jobPostId: string): Promise<CvScreeningConfigResponse> {
    const companyId = await this.assertJobAccess(recruiterId, jobPostId);
    const [company, jobPost] = await Promise.all([
      this.prisma.cvScreeningCompanyConfig.findUnique({ where: { companyId } }),
      this.prisma.jobPostCvScreeningConfig.findUnique({ where: { jobPostId } }),
    ]);

    return this.toResponse(
      'JOB_POST',
      jobPostId,
      resolveScreeningConfig(company, jobPost),
      describeInheritance(jobPost),
      jobPost,
    );
  }

  async updateJobConfig(
    user: AuthenticatedUser,
    jobPostId: string,
    dto: UpdateCvScreeningConfigDto,
  ): Promise<CvScreeningConfigResponse> {
    const companyId = await this.assertJobAccess(user.id, jobPostId);
    const data = this.buildWriteData(dto, user.id);

    const [company, jobPost] = await Promise.all([
      this.prisma.cvScreeningCompanyConfig.findUnique({ where: { companyId } }),
      this.prisma.jobPostCvScreeningConfig.upsert({
        where: { jobPostId },
        create: { jobPostId, ...data },
        update: data,
      }),
    ]);

    return this.toResponse(
      'JOB_POST',
      jobPostId,
      resolveScreeningConfig(company, jobPost),
      describeInheritance(jobPost),
      jobPost,
    );
  }

  /** Drops the override so the job falls back to the company defaults. */
  async resetJobConfig(recruiterId: string, jobPostId: string): Promise<CvScreeningConfigResponse> {
    const companyId = await this.assertJobAccess(recruiterId, jobPostId);
    await this.prisma.jobPostCvScreeningConfig.deleteMany({ where: { jobPostId } });
    const company = await this.prisma.cvScreeningCompanyConfig.findUnique({ where: { companyId } });

    return this.toResponse(
      'JOB_POST',
      jobPostId,
      resolveScreeningConfig(company, null),
      describeInheritance(null),
      null,
    );
  }

  /**
   * Both config levels share the same write shape. Only fields the caller
   * actually sent are applied, so a partial save can't silently reset the
   * rest; the four weights are validated (and written) as one block.
   */
  private buildWriteData(
    dto: UpdateCvScreeningConfigDto,
    actorId: string,
  ): ScreeningConfigWriteData {
    const weightFields = [
      dto.weightSkills,
      dto.weightExperience,
      dto.weightProjects,
      dto.weightEducation,
    ];
    const sentWeights = weightFields.filter((value) => value !== undefined && value !== null);

    if (sentWeights.length > 0 && sentWeights.length < weightFields.length) {
      throw new BadRequestException({
        code: 'CV_SCREENING_INVALID_WEIGHTS',
        message: 'Phải gửi đủ cả 4 trọng số (kỹ năng, kinh nghiệm, dự án, học vấn) cùng lúc.',
      });
    }

    const data: ScreeningConfigWriteData = {
      updatedByAccountId: actorId,
    };

    if (sentWeights.length === weightFields.length) {
      const weights: ScoringWeights = {
        skills: dto.weightSkills as number,
        experience: dto.weightExperience as number,
        projects: dto.weightProjects as number,
        education: dto.weightEducation as number,
      };
      assertValidWeights(weights);
      data.weightSkills = weights.skills;
      data.weightExperience = weights.experience;
      data.weightProjects = weights.projects;
      data.weightEducation = weights.education;
    }

    if (dto.weightPreset !== undefined) data.weightPreset = dto.weightPreset;
    if (dto.mustHaveCriteria !== undefined) {
      data.mustHaveCriteria = dto.mustHaveCriteria
        ? normalizeCriteriaInput(dto.mustHaveCriteria)
        : Prisma.DbNull;
    }
    if (dto.niceToHaveCriteria !== undefined) {
      data.niceToHaveCriteria = dto.niceToHaveCriteria
        ? normalizeCriteriaInput(dto.niceToHaveCriteria)
        : Prisma.DbNull;
    }
    if (dto.customPrompt !== undefined) data.customPrompt = dto.customPrompt?.trim() || null;
    if (dto.passingScore !== undefined) data.passingScore = dto.passingScore;
    if (dto.defaultTopN !== undefined) data.defaultTopN = dto.defaultTopN;

    return data;
  }

  private toResponse(
    scope: CvScreeningConfigResponse['scope'],
    jobPostId: string | null,
    resolved: ReturnType<typeof resolveScreeningConfig>,
    inherited: Record<string, boolean>,
    row: { updatedByAccountId?: string | null; updatedAt?: Date } | null,
  ): CvScreeningConfigResponse {
    return {
      scope,
      jobPostId,
      ...resolved,
      inherited,
      updatedByAccountId: row?.updatedByAccountId ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private async assertJobAccess(recruiterId: string, jobPostId: string): Promise<string> {
    const companyId = await this.resolveCompanyId(recruiterId);
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: {
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
    if (jobPost.companyId !== companyId || !isJobPostAccessibleToRecruiter(jobPost, recruiterId)) {
      throw new ForbiddenException('Bạn không có quyền cấu hình lọc CV cho tin tuyển dụng này.');
    }

    return companyId;
  }

  private async resolveCompanyId(recruiterId: string): Promise<string> {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });

    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }
    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    return recruiter.companyId;
  }
}

/** Re-exported so callers (and tests) can type raw rows without reaching into
 * the resolver module. */
export type { ScreeningConfigRow };
