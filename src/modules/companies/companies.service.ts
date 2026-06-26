import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  CompanyVerificationStatus,
  FilePurpose,
  FileVisibility,
  Prisma,
} from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../common/cloudinary/cloudinary.service';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import { slugify } from '../../common/utils/slugify';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(createCompanyDto: CreateCompanyDto) {
    let slug = slugify(createCompanyDto.name);
    const existing = await this.prisma.company.findUnique({ where: { slug } });
    if (existing) {
      const uniqueSuffix = Math.random().toString(36).substring(2, 7);
      slug = `${slug}-${uniqueSuffix}`;
    }

    return this.prisma.company
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

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    await this.ensureCompanyExists(id);

    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  async uploadLogo(id: string, file: UploadedFile) {
    const company = await this.ensureCompanyExists(id);
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

  async uploadCover(id: string, file: UploadedFile) {
    await this.ensureCompanyExists(id);
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

  async uploadPhoto(id: string, file: UploadedFile) {
    await this.ensureCompanyExists(id);
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

  async deletePhoto(companyId: string, photoId: string) {
    await this.ensureCompanyExists(companyId);

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

  async remove(id: string) {
    await this.ensureCompanyExists(id);
    await this.prisma.company.delete({ where: { id } });
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
    const scoreChange = isVerified ? 50.0 : -5.0;
    const actionType = isVerified ? 'BUSINESS_LICENSE_VERIFIED' : 'REJECTED_VERIFICATION';
    const defaultReason = isVerified
      ? 'Giấy phép đăng ký kinh doanh được phê duyệt'
      : 'Yêu cầu xác thực doanh nghiệp bị từ chối';
    const reason = dto.reason ?? defaultReason;

    const updatedCompany = await this.prisma.$transaction(async (tx) => {
      const currentScore = Number(company.reputationScore);
      const newScore = Math.max(0, currentScore + scoreChange);

      const comp = await tx.company.update({
        where: { id },
        data: {
          verificationStatus: dto.status,
          reputationScore: new Prisma.Decimal(newScore),
          lockedReason: isVerified ? null : reason,
        },
      });

      await tx.companyReputationActivity.create({
        data: {
          companyId: id,
          actionType,
          score: new Prisma.Decimal(scoreChange),
          reason,
          byAdminId: adminUser.id,
        },
      });

      return comp;
    });

    return {
      message: `Company verification status updated to ${dto.status} successfully.`,
      company: updatedCompany,
    };
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
