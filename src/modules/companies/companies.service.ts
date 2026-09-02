import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  ActorType,
  CompanyStatus,
  CompanyVerificationStatus,
  FilePurpose,
  FileVisibility,
  JobStatus,
  ModerationStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../common/cloudinary/cloudinary.service';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MAX_VERIFICATION_EVIDENCE_FILES, VerifyCompanyDto } from './dto/verify-company.dto';
import { slugify } from '../../common/utils/slugify';
import { CreateJobLocationDto } from '../job-locations/dto/create-job-location.dto';
import { UpdateJobLocationDto } from '../job-locations/dto/update-job-location.dto';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
import {
  COMPANY_LICENSE_EXTRACTION_PROVIDER,
  CompanyLicenseExtractionProviderPort,
  CompanyLicenseFile,
} from './ports/company-license-extraction-provider.port';
import { LLM_PROVIDER, LlmProviderPort } from '../ai/ports/llm-provider.port';
import { AuthService } from '../auth/auth.service';

/**
 * A company's current plan is its ACTIVE subscription that has not lapsed yet — a row
 * can still be ACTIVE past `expiredAt` until the expiry job runs, so both are checked.
 */
function activeSubscriptionWhere(now: Date): Prisma.CompanySubscriptionWhereInput {
  return { status: SubscriptionStatus.ACTIVE, expiredAt: { gt: now } };
}

/** Keeps the admin's order while dropping a file id sent twice. */
function dedupeIds(ids: string[]) {
  return [...new Set(ids)];
}

/**
 * Prompt and schema are carried over verbatim from the previous inline Gemini
 * call so that moving the capability behind a port cannot change which fields
 * onboarding reads off a licence. The schema keeps its legacy uppercase types
 * and `nullable`; upnext-ai normalises those before reaching the provider.
 */
const LICENSE_SYSTEM_INSTRUCTION =
  'Bạn đọc giấy phép kinh doanh và chỉ trả về JSON đúng schema. Không thêm giải thích.';

const LICENSE_PROMPT = `Trích xuất đúng từ giấy phép/GCN đăng ký doanh nghiệp. Trả JSON ngắn.
Rules:
- Không suy đoán. Không thấy thì null.
- city: tên tỉnh/thành phố cấp cao nhất, dùng dạng đầy đủ như "Thành phố Hồ Chí Minh", "Thành phố Hà Nội", "Tỉnh Bình Dương".
- address: địa chỉ trụ sở KHÔNG lặp lại city ở cuối; giữ số nhà, đường, phường/xã, quận/huyện nếu có.
- website: domain/URL thực tế nếu có, không tự tạo.
Fields: name, taxCode, city, address, email, phone, website, description.
- description: write a concise Vietnamese company introduction using only information stated in the licence. Do not invent products, company size, benefits, achievements, or services. Return null when the licence does not contain enough information.`;

const LICENSE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Tên chính thức của doanh nghiệp/công ty' },
    taxCode: { type: 'STRING', description: 'Mã số doanh nghiệp hoặc mã số thuế' },
    city: {
      type: 'STRING',
      nullable: true,
      description: 'Tỉnh/thành phố cấp cao nhất trong địa chỉ trụ sở',
    },
    address: {
      type: 'STRING',
      description: 'Địa chỉ trụ sở không bao gồm tỉnh/thành phố ở cuối',
    },
    email: { type: 'STRING', nullable: true, description: 'Địa chỉ email của công ty nếu có' },
    phone: { type: 'STRING', nullable: true, description: 'Số điện thoại của công ty nếu có' },
    website: {
      type: 'STRING',
      nullable: true,
      description: 'Địa chỉ trang web (website) của công ty nếu có',
    },
    description: {
      type: 'STRING',
      nullable: true,
      description: 'Đoạn giới thiệu ngắn bằng tiếng Việt, chỉ dùng thông tin có trên giấy phép',
    },
  },
  required: ['name', 'taxCode', 'address'],
};

const COMPANY_INFO_COMPLETION_ACTION_TYPE = 'COMPANY_INFO_COMPLETED';
const COMPANY_INFO_REQUIRED_FIELDS = [
  'description',
  'address',
  'phone',
  'companySize',
  'workingDays',
] as const;

const DEFAULT_RECRUITER_PERMISSIONS = [
  {
    code: 'jobs:manage',
    module: 'jobs',
    action: 'manage',
    description: 'Manage job posts',
  },
  {
    code: 'applications:manage',
    module: 'applications',
    action: 'manage',
    description: 'Manage candidate applications',
  },
  {
    code: 'applications:review_assigned',
    module: 'applications',
    action: 'review_assigned',
    description: 'Review assigned candidate applications',
  },
  {
    code: 'interviews:manage',
    module: 'interviews',
    action: 'manage',
    description: 'Manage interviews',
  },
  {
    code: 'interviews:review_assigned',
    module: 'interviews',
    action: 'review_assigned',
    description: 'Review assigned interviews',
  },
  {
    code: 'company:manage',
    module: 'company',
    action: 'manage',
    description: 'Manage company profile and settings',
  },
  {
    code: 'members:manage',
    module: 'members',
    action: 'manage',
    description: 'Manage company members and roles',
  },
  {
    code: 'billing:manage',
    module: 'billing',
    action: 'manage',
    description: 'Manage subscription and resources',
  },
] as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly reputationLedger: ReputationLedgerService,
    private readonly authService: AuthService,
    @Inject(COMPANY_LICENSE_EXTRACTION_PROVIDER)
    private readonly licenseExtraction: CompanyLicenseExtractionProviderPort,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProviderPort,
  ) {}

  private readonly logger = new Logger(CompaniesService.name);

  async generateLetterTemplate(id: string, type: 'OFFER' | 'REJECTION', user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);
    if (!this.llm.isConfigured()) {
      throw new BadRequestException('Dịch vụ AI chưa được cấu hình');
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id },
      select: {
        name: true,
        address: true,
        email: true,
        phone: true,
        website: true,
        description: true,
        benefits: true,
      },
    });
    const response = await this.llm.generateStructured({
      systemInstruction:
        'Bạn viết mẫu email tuyển dụng bằng tiếng Việt. Chỉ trả JSON đúng schema. Giá trị template phải là HTML an toàn để hiển thị trong trình soạn thảo, chỉ dùng các thẻ <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> và <br>. Định dạng rõ tiêu đề, lời chào, các đoạn nội dung, danh sách thông tin cần xác nhận (nếu có) và chữ ký. Chỉ dùng thông tin công ty được cung cấp; không bịa lương, quyền lợi, ngày bắt đầu, người liên hệ, địa chỉ hoặc chính sách. Mọi dữ liệu chưa có phải để placeholder trong ngoặc vuông.',
      messages: [
        {
          role: 'user',
          text: JSON.stringify({
            type,
            company,
            instruction:
              type === 'OFFER'
                ? 'Viết mẫu thư nhận việc chuyên nghiệp, ngắn gọn.'
                : 'Viết mẫu thư từ chối lịch sự, ngắn gọn.',
          }),
        },
      ],
      responseSchema: {
        type: 'OBJECT',
        properties: { template: { type: 'STRING' } },
        required: ['template'],
      },
      temperature: 0,
      modelTier: 'fast',
      executionProfile: 'interactive',
    });
    const template =
      response.value &&
      typeof response.value === 'object' &&
      typeof (response.value as { template?: unknown }).template === 'string'
        ? (response.value as { template: string }).template.trim()
        : '';
    if (!template) throw new BadRequestException('AI không thể tạo mẫu thư. Vui lòng thử lại.');
    return { template };
  }

  async create(createCompanyDto: CreateCompanyDto, user?: AuthenticatedUser) {
    if (createCompanyDto.taxCode) {
      const blacklisted = await this.prisma.taxCodeBlacklist.findUnique({
        where: { taxCode: createCompanyDto.taxCode },
        select: { id: true },
      });
      if (blacklisted) {
        throw new ForbiddenException(
          'This tax code has been blacklisted and cannot be used to register a company',
        );
      }
    }

    let slug = slugify(createCompanyDto.name);
    const existing = await this.prisma.company.findUnique({ where: { slug } });
    if (existing) {
      const uniqueSuffix = Math.random().toString(36).substring(2, 7);
      slug = `${slug}-${uniqueSuffix}`;
    }

    const company = await this.prisma.company
      .create({
        data: {
          ...createCompanyDto,
          slug,
        },
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('A company with this tax code already exists');
        }
        throw e;
      });

    // Recruiter tạo công ty qua onboarding luôn trở thành OWNER của công ty đó.
    // (Recruiter không được phép tự PATCH companyId nên việc gắn phải làm ở server.)
    if (user?.role === ActorType.RECRUITER) {
      await this.attachCreatorAsOwner(company.id, user.id);
    }

    return company;
  }

  private async attachCreatorAsOwner(companyId: string, recruiterAccountId: string) {
    await this.prisma.$transaction(async (tx) => {
      const ownerRole = await this.ensureOwnerRole(tx);
      const existingMember = await tx.companyMember.findFirst({
        where: { recruiterAccountId, companyId },
        select: { id: true },
      });

      await tx.recruiterAccount.update({
        where: { id: recruiterAccountId },
        data: {
          companyId,
          recruiterRoleId: ownerRole.id,
        },
      });

      if (!existingMember) {
        await tx.companyMember.create({
          data: {
            recruiterAccountId,
            companyId,
            roleId: ownerRole.id,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });
      }
    });
  }

  private async ensureOwnerRole(tx: Prisma.TransactionClient) {
    const permissions = await Promise.all(
      DEFAULT_RECRUITER_PERMISSIONS.map((permission) =>
        tx.recruiterPermission.upsert({
          where: { code: permission.code },
          update: {
            module: permission.module,
            action: permission.action,
            description: permission.description,
          },
          create: permission,
          select: { id: true },
        }),
      ),
    );

    const ownerRole = await tx.recruiterRole.upsert({
      where: { code: 'OWNER' },
      update: {
        name: 'Owner',
        description: 'Chu tai khoan - Toan quyen quan ly',
      },
      create: {
        code: 'OWNER',
        name: 'Owner',
        description: 'Chu tai khoan - Toan quyen quan ly',
      },
      select: { id: true },
    });

    await tx.recruiterRolePermission.createMany({
      data: permissions.map((permission) => ({
        recruiterRoleId: ownerRole.id,
        recruiterPermissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    return ownerRole;
  }

  async findAll(query: ListCompaniesQueryDto) {
    const now = new Date();
    const where: Prisma.CompanyWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.verificationStatus ? { verificationStatus: query.verificationStatus } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.planId
        ? { subscriptions: { some: { ...activeSubscriptionWhere(now), planId: query.planId } } }
        : {}),
      ...(query.plan === 'none' ? { subscriptions: { none: activeSubscriptionWhere(now) } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          logoFile: true,
          // Only the current plan is needed for the admin list; expired rows are noise.
          subscriptions: {
            where: activeSubscriptionWhere(now),
            orderBy: { expiredAt: 'desc' },
            take: 1,
            select: {
              expiredAt: true,
              plan: { select: { id: true, subscriptionName: true } },
            },
          },
          _count: {
            select: {
              jobPosts: {
                where: {
                  status: JobStatus.PUBLISHED,
                  moderationStatus: ModerationStatus.APPROVED,
                  isHidden: false,
                  deletedAt: null,
                  OR: [{ expiredAt: null }, { expiredAt: { gt: now } }],
                },
              },
            },
          },
        },
        ...toPagination(query),
      }),
      this.prisma.company.count({ where }),
    ]);

    const companyIds = items.map((c) => c.id);
    const coverFiles = await this.prisma.fileAsset.findMany({
      where: {
        ownerType: 'company_cover',
        ownerId: { in: companyIds },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coverMap = new Map<string, (typeof coverFiles)[0]>();
    for (const cover of coverFiles) {
      if (cover.ownerId && !coverMap.has(cover.ownerId)) {
        coverMap.set(cover.ownerId, cover);
      }
    }

    return {
      items: items.map(({ _count, subscriptions, ...company }) => {
        const activeSubscription = subscriptions[0];

        return {
          ...company,
          activeJobsCount: _count.jobPosts,
          coverFile: coverMap.get(company.id) ?? null,
          activePlan: activeSubscription
            ? {
                id: activeSubscription.plan.id,
                name: activeSubscription.plan.subscriptionName,
                expiredAt: activeSubscription.expiredAt,
              }
            : null,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const whereCondition = isUuid ? { id: idOrSlug } : { slug: idOrSlug };

    const company = await this.prisma.company.findUnique({
      where: whereCondition,
      include: {
        logoFile: true,
        recruiterAccounts: {
          include: {
            profile: true,
            recruiterRole: true,
          },
        },
        members: {
          include: {
            recruiterAccount: {
              include: {
                profile: true,
              },
            },
            role: true,
          },
        },
        jobPosts: {
          include: {
            employmentType: true,
            experienceLevel: true,
            jobPostLocations: {
              include: {
                jobLocation: true,
              },
            },
            jobPostSkills: {
              include: {
                skill: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${idOrSlug} not found`);
    }

    const [coverFile, photos] = await Promise.all([
      this.prisma.fileAsset.findFirst({
        where: {
          ownerType: 'company_cover',
          ownerId: company.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.fileAsset.findMany({
        where: {
          ownerType: 'company_photo',
          ownerId: company.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      ...company,
      coverFile,
      photos,
    };
  }

  async findJobs(id: string) {
    await this.ensureCompanyExists(id);

    return this.prisma.jobPost.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        employmentType: true,
        experienceLevel: true,
      },
    });
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);

    if (updateCompanyDto.taxCode) {
      const existingCompany = await this.prisma.company.findFirst({
        where: {
          taxCode: updateCompanyDto.taxCode,
          id: { not: id },
        },
        select: { id: true },
      });

      if (existingCompany) {
        throw new ConflictException('A company with this tax code already exists');
      }
    }

    const updated = await this.prisma.company
      .update({
        where: { id },
        data: updateCompanyDto,
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('A company with this tax code already exists');
        }
        throw e;
      });

    await this.awardCompanyInfoBonusIfEligible(id).catch((error: unknown) => {
      this.logger.warn(
        `Failed to evaluate company-info reputation bonus for ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return updated;
  }

  /**
   * Cộng +STATIC_COMPANY_INFO_BONUS một lần duy nhất khi company đã điền đủ các field thông
   * tin cốt lõi. Idempotent qua CompanyReputationActivity.actionType — không cộng lại lần sau.
   */
  private async awardCompanyInfoBonusIfEligible(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        description: true,
        address: true,
        phone: true,
        companySize: true,
        workingDays: true,
      },
    });

    if (!company) return;

    const isComplete = COMPANY_INFO_REQUIRED_FIELDS.every((field) => Boolean(company[field]));
    if (!isComplete) return;

    const alreadyAwarded = await this.prisma.companyReputationActivity.findFirst({
      where: { companyId, actionType: COMPANY_INFO_COMPLETION_ACTION_TYPE },
      select: { id: true },
    });
    if (alreadyAwarded) return;

    await this.prisma.$transaction((tx) =>
      this.reputationLedger.applyDelta(
        tx,
        companyId,
        REPUTATION_CONFIG.STATIC_COMPANY_INFO_BONUS,
        COMPANY_INFO_COMPLETION_ACTION_TYPE,
        'Đã cập nhật đầy đủ thông tin công ty',
      ),
    );
  }

  async uploadLogo(id: string, file: UploadedFile, user: AuthenticatedUser) {
    const company = await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);
    const savedFile = await this.saveCompanyFile(id, 'logo', file);

    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerType: 'company',
        ownerId: id,
        purpose: FilePurpose.COMPANY_LOGO,
        visibility: FileVisibility.PUBLIC,
        storageKey: savedFile.storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        publicUrl: savedFile.publicUrl,
      },
    });

    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        logoFileId: asset.id,
      },
    });

    return {
      message: 'Company logo uploaded successfully',
      file: {
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes.toString(),
        storageKey: asset.storageKey,
        publicUrl: asset.publicUrl,
      },
    };
  }

  async uploadCover(id: string, file: UploadedFile, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);
    const savedFile = await this.saveCompanyFile(id, 'cover', file);

    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerType: 'company_cover',
        ownerId: id,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: savedFile.storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        publicUrl: savedFile.publicUrl,
      },
    });

    return {
      message: 'Company cover uploaded successfully',
      file: {
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes.toString(),
        storageKey: asset.storageKey,
        publicUrl: asset.publicUrl,
      },
    };
  }

  async uploadPhoto(id: string, file: UploadedFile, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);
    const savedFile = await this.saveCompanyFile(id, 'photo', file);

    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerType: 'company_photo',
        ownerId: id,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: savedFile.storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        publicUrl: savedFile.publicUrl,
      },
    });

    return {
      message: 'Company photo uploaded successfully',
      file: {
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes.toString(),
        storageKey: asset.storageKey,
        publicUrl: asset.publicUrl,
      },
    };
  }

  async deletePhoto(companyId: string, photoId: string, user: AuthenticatedUser) {
    await this.ensureCompanyExists(companyId);
    await this.checkCompanyPermission(companyId, user);

    const asset = await this.prisma.fileAsset.findFirst({
      where: {
        id: photoId,
        ownerType: 'company_photo',
        ownerId: companyId,
      },
    });

    if (!asset) {
      throw new NotFoundException(`Photo ${photoId} not found`);
    }

    await this.prisma.fileAsset.delete({
      where: { id: photoId },
    });

    return { message: 'Photo deleted successfully' };
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);
    await this.prisma.company.delete({ where: { id } });
  }

  async scanBusinessLicense(id: string, file: UploadedFile, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);

    return this.extractBusinessLicenseFields(file);
  }

  // Dùng để quét sơ bộ (autofill) trước khi công ty được tạo — chỉ trích xuất
  // dữ liệu từ ảnh, không đọc/ghi gì vào DB nên không cần companyId.
  async scanBusinessLicensePreview(file: UploadedFile) {
    return this.extractBusinessLicenseFields(file);
  }

  private async extractBusinessLicenseFields(file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!this.licenseExtraction.isConfigured()) {
      throw new BadRequestException('Dịch vụ đọc giấy phép kinh doanh chưa được cấu hình');
    }

    const mimeType = this.licenseMimeType(file.mimetype);

    try {
      const { value } = await this.licenseExtraction.extractStructured({
        systemInstruction: LICENSE_SYSTEM_INSTRUCTION,
        prompt: LICENSE_PROMPT,
        responseSchema: LICENSE_RESPONSE_SCHEMA,
        file: { mimeType, base64Data: file.buffer.toString('base64') },
      });
      return value as Record<string, unknown>;
    } catch (error: unknown) {
      // The provider message is an internal code (AI_*), not something a
      // recruiter can act on, so it is logged rather than shown.
      const code = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Business licence extraction failed (${code})`);
      throw new BadRequestException(
        'Không thể quét giấy phép kinh doanh. Vui lòng thử lại hoặc nhập thông tin thủ công.',
      );
    }
  }

  /** Narrow the upload's mime type to what the extraction capability accepts. */
  private licenseMimeType(mimetype: string): CompanyLicenseFile['mimeType'] {
    const supported = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
    const match = supported.find((candidate) => candidate === mimetype);
    if (!match) {
      throw new BadRequestException(
        'Định dạng tệp không được hỗ trợ. Chấp nhận PDF, JPEG, PNG hoặc WEBP.',
      );
    }
    return match;
  }

  async uploadBusinessLicense(id: string, file: UploadedFile, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);

    const savedFile = await this.cloudinaryService.uploadBuffer(file, {
      folder: `companies/${id}`,
      fileNamePrefix: 'business_license',
      resourceType: 'auto',
      deliveryType: 'authenticated', // private
    });

    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerType: 'company',
        ownerId: id,
        purpose: FilePurpose.BUSINESS_LICENSE,
        visibility: FileVisibility.PRIVATE,
        storageKey: savedFile.storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        publicUrl: null, // private
      },
    });

    await this.prisma.company.update({
      where: { id },
      data: {
        businessLicenseFileId: asset.id,
        verificationStatus: CompanyVerificationStatus.PENDING,
      },
    });

    // Notify admins (who can verify) + acknowledge to the recruiter. Fire-and-forget:
    // email delivery must never block or fail the upload.
    void this.notifyCompanySubmittedForReview(id, user).catch((error: unknown) => {
      this.logger.warn(
        `Failed to send company submission emails for ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    const signedUrl = this.cloudinaryService.createSignedUrl(asset.storageKey, {
      resourceType: savedFile.resourceType,
    });

    return {
      message: 'Business license uploaded successfully. Verification status is now PENDING.',
      file: {
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes.toString(),
        storageKey: asset.storageKey,
        publicUrl: signedUrl,
      },
    };
  }

  async getBusinessLicenseUrl(id: string, user: AuthenticatedUser) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        businessLicenseFileId: true,
        businessLicenseFile: {
          select: {
            storageKey: true,
            mimeType: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    await this.checkCompanyPermission(id, user);

    if (!company.businessLicenseFileId || !company.businessLicenseFile) {
      throw new BadRequestException('This company has not uploaded a business license yet');
    }

    const mimeType = company.businessLicenseFile.mimeType;
    let resourceType: 'image' | 'raw' | 'video' = 'raw';
    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      resourceType = 'image';
    } else if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      resourceType = 'video';
    }

    const signedUrl = this.cloudinaryService.createSignedUrl(
      company.businessLicenseFile.storageKey,
      { resourceType },
    );

    return {
      url: signedUrl,
    };
  }

  async verifyCompany(id: string, dto: VerifyCompanyDto, adminUser: AuthenticatedUser) {
    const company = await this.ensureCompanyExists(id);

    const isVerified = dto.status === 'VERIFIED';
    const reason = dto.reason?.trim();

    // Từ chối mà không nêu lý do thì email gửi cho nhà tuyển dụng chỉ nói "chưa được
    // duyệt" và không nói vì sao — họ không biết phải sửa gì để gửi lại.
    if (!isVerified && !reason) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối.');
    }

    // Mỗi lần gọi lại cùng một trạng thái sẽ cộng/trừ điểm uy tín thêm một lần nữa, nên
    // phải chặn: quyết định lặp lại không phải là quyết định mới.
    if (company.verificationStatus === dto.status) {
      throw new ConflictException(
        isVerified
          ? 'Doanh nghiệp này đã được xác thực trước đó.'
          : 'Hồ sơ xác thực của doanh nghiệp này đã bị từ chối trước đó.',
      );
    }

    const evidenceFileIds = isVerified ? [] : dedupeIds(dto.evidenceFileIds ?? []);
    await this.assertVerificationEvidenceExists(evidenceFileIds);

    const finalReason = reason ?? 'Mã số thuế / Giấy phép đăng ký kinh doanh được xác thực';
    const scoreChange = isVerified ? REPUTATION_CONFIG.STATIC_TAX_CODE_BONUS : -5.0;
    const actionType = isVerified ? 'TAX_CODE_VERIFIED' : 'REJECTED_VERIFICATION';

    const { updatedCompany, evidenceFiles } = await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: { verificationStatus: dto.status },
      });

      // Lịch sử quyết định: giữ lý do, hướng dẫn và ảnh minh chứng để nhà tuyển dụng
      // xem lại được, và để admin sau biết hồ sơ này đã bị từ chối vì cái gì.
      const review = await tx.companyVerificationReview.create({
        data: {
          companyId: id,
          reviewedByAdminId: adminUser.id,
          decision: dto.status,
          reason: finalReason,
          guidance: dto.guidance?.trim() || null,
          evidences: {
            create: evidenceFileIds.map((fileId, position) => ({ fileId, position })),
          },
        },
        include: {
          evidences: {
            orderBy: { position: 'asc' },
            select: { file: { select: { publicUrl: true, originalName: true } } },
          },
        },
      });

      const ledgerResult = await this.reputationLedger.applyDelta(
        tx,
        id,
        scoreChange,
        actionType,
        finalReason,
        adminUser.id,
      );

      return { updatedCompany: ledgerResult, evidenceFiles: review.evidences };
    });

    // Notify the company's recruiters of the result. Fire-and-forget.
    void this.notifyCompanyVerificationResult({
      companyId: company.id,
      approved: isVerified,
      reason: finalReason,
      guidance: dto.guidance,
      evidence: evidenceFiles
        .filter((item) => item.file.publicUrl)
        .map((item) => ({ url: item.file.publicUrl!, name: item.file.originalName })),
    }).catch((error: unknown) => {
      this.logger.warn(
        `Failed to send company verification emails for ${company.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return {
      message: `Company verification status updated to ${dto.status} successfully.`,
      company: updatedCompany,
    };
  }

  /**
   * Ảnh minh chứng phải là file đã upload thật, nếu không FK sẽ nổ thành 500 giữa
   * transaction. Hạn mức cũng chặn ở đây để không caller nào lách qua được DTO.
   */
  private async assertVerificationEvidenceExists(evidenceFileIds: string[]) {
    if (evidenceFileIds.length === 0) return;
    if (evidenceFileIds.length > MAX_VERIFICATION_EVIDENCE_FILES) {
      throw new BadRequestException(
        `Chỉ được gửi tối đa ${MAX_VERIFICATION_EVIDENCE_FILES} ảnh minh chứng.`,
      );
    }

    const found = await this.prisma.fileAsset.count({ where: { id: { in: evidenceFileIds } } });
    if (found !== evidenceFileIds.length) {
      throw new NotFoundException('Không tìm thấy ảnh minh chứng đã tải lên.');
    }
  }

  /**
   * Hành động thủ công của Admin cho case lừa đảo: khoá vĩnh viễn công ty, ban toàn bộ
   * RecruiterAccount trực thuộc, và đưa MST vào blacklist để chặn đăng ký lại. Tách biệt hoàn
   * toàn khỏi Restricted Mode (tự động khi có report) — đây không thể tự động hoá ngược lại.
   */
  async banCompanyForFraud(id: string, reason: string, adminUser: AuthenticatedUser) {
    const company = await this.ensureCompanyExists(id);

    if (!company.taxCode) {
      throw new BadRequestException('Company has no tax code to blacklist');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id },
        data: {
          status: CompanyStatus.LOCKED,
          lockedReason: 'BLACKLISTED_FRAUD',
          lockedAt: new Date(),
          reputationScore: new Prisma.Decimal(0),
        },
      });

      await tx.recruiterAccount.updateMany({
        where: { companyId: id },
        data: { status: AccountStatus.BANNED },
      });

      await tx.taxCodeBlacklist.upsert({
        where: { taxCode: company.taxCode! },
        update: { reason, byAdminId: adminUser.id },
        create: { taxCode: company.taxCode!, reason, byAdminId: adminUser.id },
      });

      await tx.companyReputationActivity.create({
        data: {
          companyId: id,
          actionType: 'BANNED_FOR_FRAUD',
          score: new Prisma.Decimal(-Number(company.reputationScore)),
          reason,
          byAdminId: adminUser.id,
        },
      });

      return {
        message: 'Company has been banned for fraud and its tax code blacklisted.',
        company: updatedCompany,
      };
    });
  }

  /**
   * Emails admins who can verify companies + acknowledges receipt to the recruiter
   * who submitted the business license.
   */
  private async notifyCompanySubmittedForReview(companyId: string, recruiter: AuthenticatedUser) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return;
    }

    const reviewLink = this.buildFrontendUrl(`/admin/users/employers/${company.id}`);

    // Admins whose active role holds the 'companies:verify' permission.
    const admins = await this.prisma.adminUser.findMany({
      where: {
        status: 'ACTIVE',
        role: {
          status: 'ACTIVE',
          rolePermissions: {
            some: { permission: { permissionCode: 'companies:verify' } },
          },
        },
      },
      select: { email: true, fullName: true },
    });

    await Promise.all([
      ...admins.map((admin) =>
        this.emailService.sendCompanyPendingReviewToAdmin({
          to: admin.email,
          adminName: admin.fullName,
          companyName: company.name,
          recruiterEmail: recruiter.email,
          reviewLink,
        }),
      ),
      this.emailService.sendCompanySubmittedToRecruiter({
        to: recruiter.email,
        companyName: company.name,
      }),
    ]);

    if (admins.length === 0) {
      this.logger.warn(
        `No admin with 'companies:verify' permission to notify for company ${company.id}`,
      );
    }
  }

  /**
   * Emails the company's active recruiter accounts with the verification outcome.
   */
  private async notifyCompanyVerificationResult(input: {
    companyId: string;
    approved: boolean;
    reason: string;
    guidance?: string | undefined;
    /** Ảnh minh chứng kèm lý do từ chối; chỉ ảnh có publicUrl mới đính kèm được. */
    evidence?: Array<{ url: string; name: string }>;
  }) {
    const { companyId, approved, reason, guidance } = input;
    const evidence = input.evidence ?? [];

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        recruiterAccounts: {
          where: { status: 'ACTIVE' },
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
      },
    });
    if (!company) {
      return;
    }

    await Promise.all(
      company.recruiterAccounts.map(async (account) =>
        this.emailService.sendCompanyVerificationResult({
          to: account.email,
          recruiterName: account.profile?.fullName,
          companyName: company.name,
          approved,
          reason,
          guidance,
          evidence,
          // Link phải đúng theo từng người nhận: nó mang cả email để đối chiếu session
          // lẫn token đăng nhập của riêng tài khoản đó.
          companyLink: await this.buildRecruiterEmailLink('/recruiter/company-profile', account),
        }),
      ),
    );
  }

  private buildFrontendUrl(path: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    return new URL(path, frontendUrl).toString();
  }

  /**
   * Link cho nhà tuyển dụng, đi qua chặng `/recruiter/continue`.
   *
   * Bấm link trong email khi trình duyệt đang giữ session của một tài khoản khác thì
   * trước đây sẽ mở đúng trang nhưng với dữ liệu của công ty khác mà không báo gì.
   * Chặng trung gian so email trong session với `as` rồi cho đổi tài khoản nếu lệch.
   */
  private async buildRecruiterEmailLink(
    targetPath: string,
    recipient: { id: string; email: string },
  ) {
    // `buildFrontendUrl` để `new URL` tự nối, tránh sinh `//recruiter` khi
    // APP_FRONTEND_URL có dấu gạch chéo cuối.
    const url = new URL(this.buildFrontendUrl('/recruiter/continue'));
    url.searchParams.set('to', targetPath);
    url.searchParams.set('as', recipient.email);
    // Token để trang trung gian đăng nhập luôn đúng tài khoản này, không cần mật khẩu.
    url.searchParams.set(
      'token',
      await this.authService.signRecruiterMagicLinkToken({
        id: recipient.id,
        email: recipient.email,
      }),
    );
    return url.toString();
  }

  async getReputationActivities(id: string, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);

    return this.prisma.companyReputationActivity.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        byAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  async getLocations(companyId: string, user: AuthenticatedUser) {
    await this.ensureCompanyExists(companyId);
    await this.checkCompanyPermission(companyId, user);
    return this.prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: [{ city: 'asc' }, { district: 'asc' }],
    });
  }

  async createLocation(companyId: string, dto: CreateJobLocationDto, user: AuthenticatedUser) {
    await this.ensureCompanyExists(companyId);
    await this.checkCompanyPermission(companyId, user);
    return this.prisma.companyLocation.create({
      data: {
        ...dto,
        companyId,
      },
    });
  }

  async updateLocation(
    companyId: string,
    locationId: string,
    dto: UpdateJobLocationDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureCompanyExists(companyId);
    await this.checkCompanyPermission(companyId, user);

    const location = await this.prisma.companyLocation.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    return this.prisma.companyLocation.update({
      where: { id: locationId },
      data: dto,
    });
  }

  async removeLocation(companyId: string, locationId: string, user: AuthenticatedUser) {
    await this.ensureCompanyExists(companyId);
    await this.checkCompanyPermission(companyId, user);

    const location = await this.prisma.companyLocation.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    await this.prisma.companyLocation.delete({
      where: { id: locationId },
    });
    return { message: 'Location deleted successfully' };
  }

  private async checkCompanyPermission(companyId: string, user: AuthenticatedUser) {
    if (user.role === ActorType.ADMIN || user.companyId === companyId) {
      return;
    }

    if (user.role === ActorType.RECRUITER) {
      const account = await this.prisma.recruiterAccount.findFirst({
        where: {
          id: user.id,
          companyId,
        },
        select: { id: true },
      });

      if (account) {
        return;
      }
    }

    throw new ForbiddenException('You do not have permission to manage this company');
  }

  private async ensureCompanyExists(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    return company;
  }

  private async saveCompanyFile(id: string, kind: 'logo' | 'cover' | 'photo', file?: UploadedFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.cloudinaryService.uploadBuffer(file, {
      folder: `companies/${id}`,
      fileNamePrefix: kind,
      resourceType: 'image',
    });
  }
}
