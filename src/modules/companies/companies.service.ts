import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  create(createCompanyDto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: createCompanyDto,
    }).catch((e: unknown) => {
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
      ...(query.verificationStatus
        ? { verificationStatus: query.verificationStatus }
        : {}),
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

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
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
      throw new NotFoundException(`Company ${id} not found`);
    }

    return company;
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

  async remove(id: string) {
    await this.ensureCompanyExists(id);
    await this.prisma.company.delete({ where: { id } });
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

  private async saveCompanyFile(id: string, kind: 'logo' | 'cover', file?: UploadedFile) {
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
