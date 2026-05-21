import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../shared/decorators/current-user.decorator';
import { PaginationQueryDto, toPagination } from '../../shared/dto/pagination-query.dto';
import { slugify } from '../../shared/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.CompanyWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        ...toPagination(query),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { jobs: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, limit: query.limit } };
  }

  findById(id: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true, role: true },
            },
          },
        },
        _count: { select: { jobs: true } },
      },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCompanyDto) {
    const slug = slugify(dto.name);

    try {
      return await this.prisma.company.create({
        data: {
          ...dto,
          slug,
          members: {
            create: {
              userId: user.id,
              role: user.role === UserRole.ADMIN ? 'ADMIN' : 'OWNER',
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Company slug is already taken');
      }
      throw error;
    }
  }

  async update(user: AuthenticatedUser, companyId: string, dto: UpdateCompanyDto) {
    await this.assertCanManageCompany(user, companyId);
    const data: Prisma.CompanyUpdateInput = {
      ...dto,
      slug: dto.name ? slugify(dto.name) : undefined,
    };

    return this.prisma.company.update({
      where: { id: companyId },
      data,
    });
  }

  async remove(user: AuthenticatedUser, companyId: string) {
    await this.assertCanManageCompany(user, companyId);
    await this.prisma.company.delete({ where: { id: companyId } });
    return { deleted: true };
  }

  async assertCanManageCompany(user: AuthenticatedUser, companyId: string) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    const membership = await this.prisma.companyMember.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You cannot manage this company');
    }
  }
}
