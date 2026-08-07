import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyVerificationStatus,
  CompanyStatus,
  JobStatus,
  Prisma,
  ModerationStatus,
  ActorType,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { ApproveJobPostDto } from './dto/approve-job-post.dto';
import { RejectJobPostDto } from './dto/reject-job-post.dto';
import { UpdateJobPostVisibilityDto } from './dto/update-job-post-visibility.dto';
import {
  AddLocationToJobDto,
  AddSkillToJobDto,
  AddSpecializationToJobDto,
} from './dto/job-post-relations.dto';
import { ListAdminJobPostsQueryDto } from './dto/list-admin-job-posts-query.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
import { PublicJobPostQueryDto } from './dto/public-job-post-query.dto';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';

@Injectable()
export class JobPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(user: AuthenticatedUser, createJobPostDto: CreateJobPostDto) {
    const context = await this.resolveRecruiterContext(user.id);
    const slug = this.createSlug(createJobPostDto.title);

    return this.prisma.jobPost.create({
      data: {
        ...createJobPostDto,
        slug,
        createdByRecruiterId: user.id,
        companyId: context.company.id,
        status: JobStatus.DRAFT,
      },
      include: this.ownerJobPostInclude(),
    });
  }

  async findAll(query: PublicJobPostQueryDto = {}) {
    const keyword = query.keyword?.trim();
    const location = query.location?.trim();
    const locationTerms = location ? this.locationSearchTerms(location) : [];

    return this.prisma.jobPost.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        publishedAt: { not: null },
        deletedAt: null,
        isHidden: false,
        company: { status: CompanyStatus.ACTIVE },
        OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
        ...(keyword
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: keyword, mode: 'insensitive' } },
                    { description: { contains: keyword, mode: 'insensitive' } },
                    { requirements: { contains: keyword, mode: 'insensitive' } },
                    { benefits: { contains: keyword, mode: 'insensitive' } },
                    { company: { name: { contains: keyword, mode: 'insensitive' } } },
                    { jobCategory: { name: { contains: keyword, mode: 'insensitive' } } },
                    {
                      jobPostSkills: {
                        some: { skill: { name: { contains: keyword, mode: 'insensitive' } } },
                      },
                    },
                    {
                      jobPostSpecializations: {
                        some: {
                          specialization: { name: { contains: keyword, mode: 'insensitive' } },
                        },
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
        ...(locationTerms.length > 0
          ? {
              jobPostLocations: {
                some: {
                  jobLocation: {
                    OR: locationTerms.map((term) => ({
                      city: { contains: term, mode: 'insensitive' as const },
                    })),
                  },
                },
              },
            }
          : {}),
      },
      include: this.publicJobPostInclude(),
      orderBy: { publishedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const jobPost = await this.prisma.jobPost.findFirst({
      where: {
        id,
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        publishedAt: { not: null },
        deletedAt: null,
        isHidden: false,
        company: { status: CompanyStatus.ACTIVE },
        OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
      },
      include: this.publicJobPostInclude(),
    });

    if (!jobPost) {
      throw new NotFoundException(`Job post ${id} not found`);
    }

    return jobPost;
  }

  async update(id: string, recruiterId: string, updateJobPostDto: UpdateJobPostDto) {
    const job = await this.verifyJobOwner(id, recruiterId);

    const needsReReview = job.moderationStatus !== ModerationStatus.PENDING;

    return this.prisma.jobPost.update({
      where: { id },
      data: {
        ...updateJobPostDto,
        ...(needsReReview
          ? {
              moderationStatus: ModerationStatus.PENDING,
              reason: null,
              moderationNote: null,
            }
          : {}),
      },
      include: this.ownerJobPostInclude(),
    });
  }

  async remove(id: string, recruiterId: string) {
    await this.verifyJobOwner(id, recruiterId);
    await this.prisma.jobPost.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: JobStatus.CLOSED,
      },
    });
  }

  async updateStatus(id: string, recruiterId: string, status: JobStatus) {
    const job = await this.verifyJobOwner(id, recruiterId);

    if (
      status === JobStatus.PUBLISHED &&
      job.status !== JobStatus.DRAFT &&
      job.status !== JobStatus.CLOSED
    ) {
      throw new BadRequestException(
        'Chỉ có thể đăng hoặc mở lại tin từ trạng thái bản nháp hoặc đã đóng.',
      );
    }

    if (status === JobStatus.CLOSED && job.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ có thể đóng tin đang ở trạng thái đã đăng.');
    }

    if (status === JobStatus.PUBLISHED) {
      // Publishing is deliberately NOT metered: reputation is the only gate, so
      // a company can always post. Paid plans differentiate on boosting a post,
      // not on being allowed to publish one.
      await this.ensureCompanyCanPublish(job.companyId);
    }

    const data: Prisma.JobPostUpdateInput = { status };
    if (status === JobStatus.PUBLISHED) {
      data.publishedAt = new Date();
    }

    return this.prisma.jobPost.update({
      where: { id },
      data,
      include: this.ownerJobPostInclude(),
    });
  }

  async getCompanyJobPosts(recruiterId: string) {
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });
    if (!account?.companyId) {
      throw new BadRequestException('Recruiter account has not been attached to a company');
    }

    return this.prisma.jobPost.findMany({
      where: {
        companyId: account.companyId,
        deletedAt: null,
        OR: [
          { createdByRecruiterId: recruiterId },
          {
            accessRevocations: {
              none: { recruiterAccountId: recruiterId },
            },
          },
        ],
      },
      include: this.ownerJobPostInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async listJobPostAccessMembers(jobId: string, user: AuthenticatedUser) {
    const job = await this.verifyCanManageJobAccess(jobId, user);
    const [members, revocations] = await Promise.all([
      this.prisma.companyMember.findMany({
        where: {
          companyId: job.companyId,
          recruiterAccountId: { not: null },
        },
        include: {
          recruiterAccount: {
            select: {
              id: true,
              email: true,
              status: true,
              profile: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          role: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.jobPostAccessRevocation.findMany({
        where: { jobPostId: jobId },
        select: { recruiterAccountId: true, revokedAt: true },
      }),
    ]);
    const revocationByRecruiterId = new Map(
      revocations.map((revocation) => [revocation.recruiterAccountId, revocation.revokedAt]),
    );

    return {
      jobPost: {
        id: job.id,
        title: job.title,
        createdByRecruiterId: job.createdByRecruiterId,
      },
      members: members.flatMap((member) => {
        const account = member.recruiterAccount;
        if (!account) return [];

        const isJobCreator = account.id === job.createdByRecruiterId;
        const revokedAt = revocationByRecruiterId.get(account.id) ?? null;
        return [
          {
            companyMemberId: member.id,
            recruiterAccountId: account.id,
            email: account.email,
            fullName: account.profile?.fullName ?? account.email,
            avatarUrl: account.profile?.avatarUrl ?? null,
            role: member.role,
            memberStatus: member.status,
            accountStatus: account.status,
            isJobCreator,
            hasAccess: isJobCreator || revokedAt === null,
            revokedAt: isJobCreator ? null : revokedAt,
          },
        ];
      }),
    };
  }

  async updateJobPostMemberAccess(
    jobId: string,
    recruiterAccountId: string,
    hasAccess: boolean,
    user: AuthenticatedUser,
  ) {
    const job = await this.verifyCanManageJobAccess(jobId, user);
    const targetMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId: job.companyId,
        recruiterAccountId,
      },
      select: {
        id: true,
        recruiterAccountId: true,
      },
    });

    if (!targetMember?.recruiterAccountId) {
      throw new NotFoundException('Không tìm thấy thành viên trong công ty.');
    }
    if (recruiterAccountId === job.createdByRecruiterId && !hasAccess) {
      throw new BadRequestException('Không thể thu hồi quyền của người tạo tin tuyển dụng.');
    }
    if (recruiterAccountId === user.id && !hasAccess) {
      throw new BadRequestException('Bạn không thể tự thu hồi quyền truy cập của mình.');
    }

    if (hasAccess) {
      await this.prisma.jobPostAccessRevocation.deleteMany({
        where: { jobPostId: jobId, recruiterAccountId },
      });
    } else {
      await this.prisma.jobPostAccessRevocation.upsert({
        where: {
          jobPostId_recruiterAccountId: {
            jobPostId: jobId,
            recruiterAccountId,
          },
        },
        update: {
          revokedByRecruiterId: user.id,
          revokedAt: new Date(),
        },
        create: {
          jobPostId: jobId,
          recruiterAccountId,
          revokedByRecruiterId: user.id,
        },
      });
    }

    return { recruiterAccountId, hasAccess };
  }

  async findAllForAdmin(query: ListAdminJobPostsQueryDto) {
    const where: Prisma.JobPostWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.moderationStatus ? { moderationStatus: query.moderationStatus } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.employmentTypeId ? { employmentTypeId: query.employmentTypeId } : {}),
      ...(query.city
        ? {
            jobPostLocations: {
              some: { jobLocation: { is: { city: { equals: query.city, mode: 'insensitive' } } } },
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { company: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
              {
                createdByRecruiter: {
                  is: { email: { contains: query.q, mode: 'insensitive' } },
                },
              },
              {
                createdByRecruiter: {
                  is: {
                    profile: {
                      is: { fullName: { contains: query.q, mode: 'insensitive' } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const totalPages = (total: number) => Math.ceil(total / query.limit);

    const [items, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: this.adminJobPostInclude(),
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: totalPages(total),
        hasNextPage: query.page < totalPages(total),
        hasPrevPage: query.page > 1,
      },
    };
  }

  async approveJobPost(id: string, dto: ApproveJobPostDto) {
    const jobPost = await this.prisma.jobPost.findFirst({
      where: { id, deletedAt: null },
    });

    if (!jobPost) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng với ID: ${id}`);
    }

    if (jobPost.moderationStatus !== ModerationStatus.PENDING) {
      throw new BadRequestException('Tin tuyển dụng đã được duyệt hoặc từ chối trước đó.');
    }

    const updatedJob = await this.prisma.jobPost.update({
      where: { id },
      data: {
        moderationStatus: ModerationStatus.APPROVED,
        moderationNote: dto.moderationNote ?? null,
        reason: null,
      },
      include: this.adminJobPostInclude(),
    });

    try {
      await this.notificationsService.createNotification({
        recipientId: jobPost.createdByRecruiterId,
        recipientType: ActorType.RECRUITER,
        title: 'Tin tuyển dụng đã được phê duyệt',
        body: `Tin tuyển dụng "${jobPost.title}" của bạn đã được duyệt thành công.`,
        targetId: jobPost.id,
        targetType: 'JOB_POST',
      });
    } catch (err) {
      console.error('Failed to send approval notification:', err);
    }

    return {
      message: 'Phê duyệt tin tuyển dụng thành công.',
      jobPost: updatedJob,
    };
  }

  async rejectJobPost(id: string, dto: RejectJobPostDto) {
    const jobPost = await this.prisma.jobPost.findFirst({
      where: { id, deletedAt: null },
    });

    if (!jobPost) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng với ID: ${id}`);
    }

    if (jobPost.moderationStatus !== ModerationStatus.PENDING) {
      throw new BadRequestException('Tin tuyển dụng đã được duyệt hoặc từ chối trước đó.');
    }

    const updatedJob = await this.prisma.jobPost.update({
      where: { id },
      data: {
        moderationStatus: ModerationStatus.REJECTED,
        reason: dto.reason,
        moderationNote: null,
      },
      include: this.adminJobPostInclude(),
    });

    try {
      await this.notificationsService.createNotification({
        recipientId: jobPost.createdByRecruiterId,
        recipientType: ActorType.RECRUITER,
        title: 'Tin tuyển dụng đã bị từ chối',
        body: `Lý do: ${dto.reason}`,
        targetId: jobPost.id,
        targetType: 'JOB_POST',
      });
    } catch (err) {
      console.error('Failed to send rejection notification:', err);
    }

    return {
      message: 'Từ chối duyệt tin tuyển dụng thành công.',
      jobPost: updatedJob,
    };
  }

  async updateVisibility(id: string, dto: UpdateJobPostVisibilityDto) {
    const jobPost = await this.prisma.jobPost.findFirst({
      where: { id, deletedAt: null },
    });

    if (!jobPost) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng với ID: ${id}`);
    }

    const updatedJob = await this.prisma.jobPost.update({
      where: { id },
      data: {
        isHidden: dto.isHidden,
      },
      include: this.adminJobPostInclude(),
    });

    const statusText = dto.isHidden ? 'ẩn' : 'hiển thị';

    return {
      message: `Cập nhật trạng thái ${statusText} tin tuyển dụng thành công.`,
      jobPost: updatedJob,
    };
  }

  async addSkillToJob(jobId: string, recruiterId: string, dto: AddSkillToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostSkill.create({
      data: {
        jobPostId: jobId,
        ...dto,
      },
    });
  }

  async removeSkillFromJob(jobId: string, skillId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostSkill.delete({
      where: {
        jobPostId_skillId: {
          jobPostId: jobId,
          skillId,
        },
      },
    });
  }

  async addLocationToJob(jobId: string, recruiterId: string, dto: AddLocationToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostLocation.create({
      data: {
        jobPostId: jobId,
        jobLocationId: dto.jobLocationId,
      },
    });
  }

  async removeLocationFromJob(jobId: string, locationId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostLocation.delete({
      where: {
        jobPostId_jobLocationId: {
          jobPostId: jobId,
          jobLocationId: locationId,
        },
      },
    });
  }

  async addSpecializationToJob(jobId: string, recruiterId: string, dto: AddSpecializationToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostSpecialization.create({
      data: {
        jobPostId: jobId,
        ...dto,
      },
    });
  }

  async removeSpecializationFromJob(jobId: string, specializationId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostSpecialization.delete({
      where: {
        jobPostId_specializationId: {
          jobPostId: jobId,
          specializationId,
        },
      },
    });
  }

  async setJobSkills(jobId: string, recruiterId: string, skillIds: string[]) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.$transaction([
      this.prisma.jobPostSkill.deleteMany({ where: { jobPostId: jobId } }),
      this.prisma.jobPostSkill.createMany({
        data: skillIds.map((skillId) => ({ jobPostId: jobId, skillId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async setJobLocations(jobId: string, recruiterId: string, jobLocationIds: string[]) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.$transaction([
      this.prisma.jobPostLocation.deleteMany({ where: { jobPostId: jobId } }),
      this.prisma.jobPostLocation.createMany({
        data: jobLocationIds.map((jobLocationId) => ({ jobPostId: jobId, jobLocationId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async setJobSpecializations(jobId: string, recruiterId: string, specializationIds: string[]) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.$transaction([
      this.prisma.jobPostSpecialization.deleteMany({ where: { jobPostId: jobId } }),
      this.prisma.jobPostSpecialization.createMany({
        data: specializationIds.map((specializationId) => ({ jobPostId: jobId, specializationId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async recordView(
    jobId: string,
    ipAddress?: string,
    userAgent?: string,
    candidateAccountId?: string,
    visitorKey?: string,
  ) {
    await this.findOne(jobId);
    let profileId: string | undefined;
    const normalizedVisitorKey = visitorKey?.trim().slice(0, 120) || undefined;

    if (candidateAccountId) {
      const profile = await this.prisma.candidateProfile.findUnique({
        where: { candidateAccountId },
        select: { id: true },
      });

      profileId = profile?.id;
    }

    // A page refresh or a React remount must not inflate a public popularity
    // signal. Prefer a signed-in candidate identity; otherwise use the
    // anonymous browser key and only fall back to IP for legacy callers.
    const deduplicationKeys = profileId
      ? [{ candidateProfileId: profileId }]
      : normalizedVisitorKey
        ? [{ visitorKey: normalizedVisitorKey }]
        : ipAddress
          ? [{ ipAddress }]
          : [];

    if (deduplicationKeys.length > 0) {
      const seenSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingView = await this.prisma.jobView.findFirst({
        where: {
          jobPostId: jobId,
          viewedAt: { gte: seenSince },
          OR: deduplicationKeys,
        },
        orderBy: { viewedAt: 'desc' },
      });

      if (existingView) return existingView;
    }

    return this.prisma.jobView.create({
      data: {
        jobPostId: jobId,
        ipAddress,
        userAgent,
        candidateProfileId: profileId,
        visitorKey: normalizedVisitorKey,
      },
    });
  }

  async getViewStats(jobId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    const views = await this.prisma.jobView.count({
      where: { jobPostId: jobId },
    });
    return { views };
  }

  private async verifyJobOwner(jobId: string, recruiterId: string) {
    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        deletedAt: null,
      },
      select: {
        id: true,
        createdByRecruiterId: true,
        companyId: true,
        status: true,
        moderationStatus: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job post not found');
    }

    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to modify this job post');
    }

    return job;
  }

  private async verifyCanManageJobAccess(jobId: string, user: AuthenticatedUser) {
    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobId, deletedAt: null },
      select: {
        id: true,
        title: true,
        companyId: true,
        createdByRecruiterId: true,
        accessRevocations: {
          where: { recruiterAccountId: user.id },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job post not found');
    }
    if (job.companyId !== user.companyId) {
      throw new ForbiddenException('Bạn không có quyền quản lý truy cập của tin tuyển dụng này.');
    }

    const isJobCreator = job.createdByRecruiterId === user.id;
    const canManageJobs = user.permissions.includes('jobs:manage');
    if (!isJobCreator && (!canManageJobs || job.accessRevocations.length > 0)) {
      throw new ForbiddenException('Bạn không có quyền quản lý truy cập của tin tuyển dụng này.');
    }

    return job;
  }

  private async resolveRecruiterContext(recruiterId: string) {
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: {
        id: true,
        company: {
          select: {
            id: true,
            verificationStatus: true,
            businessLicenseFileId: true,
          },
        },
      },
    });

    if (!account?.company) {
      throw new BadRequestException('Recruiter account has not been attached to a company');
    }

    // A verified company has already been through review, so the licence file is not what proves
    // it: companies verified by tax code carry no file and were being locked out of creating a
    // draft at all. Keep the file requirement for companies that have not been verified yet.
    if (
      !account.company.businessLicenseFileId &&
      account.company.verificationStatus !== CompanyVerificationStatus.VERIFIED
    ) {
      throw new BadRequestException(
        'Company business license is required before creating job posts',
      );
    }

    return { company: account.company };
  }

  private async ensureCompanyCanPublish(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        verificationStatus: true,
        reputationScore: true,
      },
    });

    if (company?.verificationStatus !== CompanyVerificationStatus.VERIFIED) {
      // Verification is the gate here. Reporting the missing licence first told a company that was
      // simply not verified yet to go upload a file, which is not what unblocks it.
      throw new ForbiddenException('Company must be verified before publishing job posts');
    }

    if (Number(company.reputationScore) < REPUTATION_CONFIG.MIN_SCORE_TO_PUBLISH) {
      throw new ForbiddenException(
        `Company reputation score must be at least ${REPUTATION_CONFIG.MIN_SCORE_TO_PUBLISH} to publish job posts`,
      );
    }
  }

  private publicJobPostInclude() {
    return {
      company: {
        select: {
          id: true,
          logoFileId: true,
          type: true,
          name: true,
          slug: true,
          taxCode: true,
          address: true,
          email: true,
          phone: true,
          website: true,
          description: true,
          companySize: true,
          workingDays: true,
          verificationStatus: true,
          reputationScore: true,
          status: true,
          lockedReason: true,
          lockedAt: true,
          createdAt: true,
          updatedAt: true,
          logoFile: {
            select: {
              id: true,
              publicUrl: true,
              mimeType: true,
              originalName: true,
            },
          },
        },
      },
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      jobPostSkills: { include: { skill: true } },
      jobPostLocations: {
        include: {
          jobLocation: {
            select: {
              id: true,
              country: true,
              workingModel: true,
              city: true,
              district: true,
              address: true,
              latitude: true,
              longitude: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      jobPostSpecializations: { include: { specialization: true } },
    } satisfies Prisma.JobPostInclude;
  }

  private locationSearchTerms(location: string) {
    const normalized = location.toLowerCase();
    if (normalized === 'tất cả địa điểm') return [];
    if (
      normalized.includes('hồ chí minh') ||
      normalized.includes('ho chi minh') ||
      normalized.includes('hcm')
    ) {
      return ['Hồ Chí Minh', 'TP. Hồ Chí Minh', 'Ho Chi Minh'];
    }
    if (
      normalized.includes('hà nội') ||
      normalized.includes('ha noi') ||
      normalized.includes('hanoi')
    ) {
      return ['Hà Nội', 'TP. Hà Nội', 'Ha Noi'];
    }
    return [location];
  }

  private ownerJobPostInclude() {
    return {
      company: {
        select: {
          id: true,
          name: true,
          verificationStatus: true,
          businessLicenseFileId: true,
        },
      },
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      jobPostSkills: { include: { skill: true } },
      jobPostLocations: { include: { jobLocation: true } },
      jobPostSpecializations: { include: { specialization: true } },
      createdByRecruiter: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      _count: {
        select: {
          applications: true,
          views: true,
        },
      },
    } satisfies Prisma.JobPostInclude;
  }

  private adminJobPostInclude() {
    return {
      company: {
        select: {
          id: true,
          name: true,
          status: true,
          verificationStatus: true,
        },
      },
      createdByRecruiter: {
        select: {
          id: true,
          email: true,
          status: true,
          profile: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
            },
          },
          recruiterRole: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      jobPostLocations: {
        include: {
          jobLocation: true,
        },
      },
      _count: {
        select: {
          applications: true,
          views: true,
          savedJobs: true,
        },
      },
    } satisfies Prisma.JobPostInclude;
  }

  private createSlug(title: string) {
    const normalizedTitle = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return `${normalizedTitle || 'job'}-${Date.now()}`;
  }
}
