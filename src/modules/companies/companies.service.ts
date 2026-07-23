import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  Prisma,
} from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../common/cloudinary/cloudinary.service';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import { slugify } from '../../common/utils/slugify';
import { CreateJobLocationDto } from '../job-locations/dto/create-job-location.dto';
import { UpdateJobLocationDto } from '../job-locations/dto/update-job-location.dto';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';

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
  ) {}

  private readonly logger = new Logger(CompaniesService.name);

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
    };

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          logoFile: true,
        },
        ...toPagination(query),
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items,
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

    const apiKey = this.configService.get<string>('geminiApiKey')?.trim();
    if (!apiKey) {
      throw new BadRequestException('Gemini API key is not configured on the server');
    }

    // Convert file buffer to base64
    const base64Data = file.buffer.toString('base64');

    const prompt = `Trích xuất đúng từ giấy phép/GCN đăng ký doanh nghiệp. Trả JSON ngắn.
Rules:
- Không suy đoán. Không thấy thì null.
- city: tên tỉnh/thành phố cấp cao nhất, dùng dạng đầy đủ như "Thành phố Hồ Chí Minh", "Thành phố Hà Nội", "Tỉnh Bình Dương".
- address: địa chỉ trụ sở KHÔNG lặp lại city ở cuối; giữ số nhà, đường, phường/xã, quận/huyện nếu có.
- website: domain/URL thực tế nếu có, không tự tạo.
Fields: name, taxCode, city, address, email, phone, website.`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: file.mimetype,
                      data: base64Data,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
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
                  email: {
                    type: 'STRING',
                    nullable: true,
                    description: 'Địa chỉ email của công ty nếu có',
                  },
                  phone: {
                    type: 'STRING',
                    nullable: true,
                    description: 'Số điện thoại của công ty nếu có',
                  },
                  website: {
                    type: 'STRING',
                    nullable: true,
                    description: 'Địa chỉ trang web (website) của công ty nếu có',
                  },
                },
                required: ['name', 'taxCode', 'address'],
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const responseData = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
            }>;
          };
        }>;
      };
      const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Failed to extract text from Gemini response');
      }

      return JSON.parse(text) as Record<string, unknown>;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Không thể quét giấy phép kinh doanh: ${message}`);
    }
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
    const scoreChange = isVerified ? REPUTATION_CONFIG.STATIC_TAX_CODE_BONUS : -5.0;
    const actionType = isVerified ? 'TAX_CODE_VERIFIED' : 'REJECTED_VERIFICATION';
    const defaultReason = isVerified
      ? 'Mã số thuế / Giấy phép đăng ký kinh doanh được xác thực'
      : 'Yêu cầu xác thực doanh nghiệp bị từ chối';
    const reason = dto.reason ?? defaultReason;

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: {
          verificationStatus: dto.status,
          lockedReason: isVerified ? null : reason,
        },
      });

      return this.reputationLedger.applyDelta(
        tx,
        id,
        scoreChange,
        actionType,
        reason,
        adminUser.id,
      );
    });

    // Notify the company's recruiters of the result. Fire-and-forget.
    void this.notifyCompanyVerificationResult(company.id, isVerified, reason, dto.guidance).catch(
      (error: unknown) => {
        this.logger.warn(
          `Failed to send company verification emails for ${company.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );

    return {
      message: `Company verification status updated to ${dto.status} successfully.`,
      company: updatedCompany,
    };
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

    const reviewLink = this.buildFrontendUrl(`/admin/companies/${company.id}`);

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
  private async notifyCompanyVerificationResult(
    companyId: string,
    approved: boolean,
    reason: string,
    guidance?: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        recruiterAccounts: {
          where: { status: 'ACTIVE' },
          select: { email: true, profile: { select: { fullName: true } } },
        },
      },
    });
    if (!company) {
      return;
    }

    const companyLink = this.buildFrontendUrl(`/recruiter/company`);

    await Promise.all(
      company.recruiterAccounts.map((account) =>
        this.emailService.sendCompanyVerificationResult({
          to: account.email,
          recruiterName: account.profile?.fullName,
          companyName: company.name,
          approved,
          reason,
          guidance,
          companyLink,
        }),
      ),
    );
  }

  private buildFrontendUrl(path: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    return new URL(path, frontendUrl).toString();
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
