import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
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

  async scanBusinessLicense(id: string, file: UploadedFile, user: AuthenticatedUser) {
    await this.ensureCompanyExists(id);
    await this.checkCompanyPermission(id, user);

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const apiKey = this.configService.get<string>('geminiApiKey')?.trim();
    if (!apiKey) {
      throw new BadRequestException('Gemini API key is not configured on the server');
    }

    // Convert file buffer to base64
    const base64Data = file.buffer.toString('base64');

    const prompt = `Hãy trích xuất chính xác các thông tin từ giấy phép kinh doanh/giấy chứng nhận đăng ký doanh nghiệp này.
Trả về một JSON object chứa các trường sau:
- name (tên công ty chính thức đầy đủ, ví dụ: CÔNG TY CỔ PHẦN UPNEXT VIỆT NAM)
- taxCode (mã số thuế hoặc mã số doanh nghiệp, là chuỗi chỉ gồm các chữ số)
- address (địa chỉ trụ sở chính đầy đủ, có dạng: số nhà tên đường, phường/xã, quận/huyện, tỉnh/thành phố. Vui lòng ghi rõ tên các cấp hành chính đầy đủ không viết tắt, ví dụ: 'Phường 11, Quận Gò Vấp, Thành phố Hồ Chí Minh')
- email (email liên hệ nếu có ghi trong giấy phép, ví dụ: contact@upnext.works, nếu không có trả về null)
- phone (số điện thoại liên hệ nếu có ghi trong giấy phép, nếu không có trả về null)
- website (địa chỉ website nếu có ghi trong giấy phép, nếu không có trả về null)

Chỉ trích xuất các thông tin thực tế hiển thị trên văn bản, không tự ý sáng tạo thông tin. Nếu không có hoặc không tìm thấy trường nào thì để giá trị null.`;

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
                  address: { type: 'STRING', description: 'Địa chỉ trụ sở chính của doanh nghiệp' },
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
