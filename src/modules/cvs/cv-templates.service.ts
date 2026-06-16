import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCvTemplateDto } from './dto/create-cv-template.dto';
import { ListCvTemplatesQueryDto } from './dto/list-cv-templates-query.dto';
import { UpdateCvTemplateDto } from './dto/update-cv-template.dto';

const cvTemplateSelect = {
  id: true,
  name: true,
  description: true,
  previewImageUrl: true,
  layoutKey: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      cvVersions: true,
    },
  },
} satisfies Prisma.CVTemplateSelect;

type CvTemplateRecord = Prisma.CVTemplateGetPayload<{ select: typeof cvTemplateSelect }>;

@Injectable()
export class CvTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCvTemplateDto) {
    try {
      const template = await this.prisma.cVTemplate.create({
        data: dto,
        select: cvTemplateSelect,
      });

      return this.mapTemplate(template);
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async findAll(query: ListCvTemplatesQueryDto) {
    const where: Prisma.CVTemplateWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { layoutKey: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cVTemplate.findMany({
        where,
        ...toPagination(query),
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        select: cvTemplateSelect,
      }),
      this.prisma.cVTemplate.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapTemplate(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const template = await this.prisma.cVTemplate.findUnique({
      where: { id },
      select: cvTemplateSelect,
    });

    if (!template) {
      throw new NotFoundException('Không tìm thấy mẫu CV');
    }

    return this.mapTemplate(template);
  }

  async update(id: string, dto: UpdateCvTemplateDto) {
    await this.findOne(id);

    try {
      const template = await this.prisma.cVTemplate.update({
        where: { id },
        data: dto,
        select: cvTemplateSelect,
      });

      return this.mapTemplate(template);
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  activate(id: string) {
    return this.setActive(id, true);
  }

  deactivate(id: string) {
    return this.setActive(id, false);
  }

  async remove(id: string) {
    const template = await this.findOne(id);

    if (template.cvVersionsCount > 0) {
      throw new ConflictException('Mẫu CV đang được phiên bản CV sử dụng');
    }

    const deleted = await this.prisma.cVTemplate.delete({
      where: { id },
      select: cvTemplateSelect,
    });

    return this.mapTemplate(deleted);
  }

  private async setActive(id: string, isActive: boolean) {
    await this.findOne(id);

    const template = await this.prisma.cVTemplate.update({
      where: { id },
      data: { isActive },
      select: cvTemplateSelect,
    });

    return this.mapTemplate(template);
  }

  private mapTemplate(template: CvTemplateRecord) {
    const { _count, ...data } = template;

    return {
      ...data,
      cvVersionsCount: _count.cvVersions,
    };
  }

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Mẫu CV với layoutKey này đã tồn tại');
    }
  }
}
