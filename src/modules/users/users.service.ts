import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, toPagination } from '../../shared/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { fullName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        ...toPagination(query),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => this.toPublicUser(user)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        companyMemberships: {
          include: { company: true },
        },
      },
    });

    return this.toPublicUser(user);
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    return this.toPublicUser(user);
  }

  async updateByAdmin(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    return this.toPublicUser(user);
  }

  private toPublicUser<T extends { passwordHash: string }>(user: T): Omit<T, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
