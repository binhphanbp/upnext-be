import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateAccountDto } from './dto/create-candidate-account.dto';
import { UpdateCandidateAccountDto } from './dto/update-candidate-account.dto';

@Injectable()
export class CandidateAccountService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createCandidateAccountDto: CreateCandidateAccountDto) {
    const { password, ...data } = createCandidateAccountDto;

    try {
      return await this.prisma.candidateAccount.create({
        data: {
          ...data,
          email: data.email.toLowerCase(),
          passwordHash: password ? await hash(password, 10) : undefined,
        },
        select: this.defaultSelect,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.CandidateAccountWhereInput = query.q
      ? {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.candidateAccount.findMany({
        where,
        ...toPagination(query),
        orderBy: { createdAt: 'desc' },
        select: this.defaultSelect,
      }),
      this.prisma.candidateAccount.count({ where }),
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
    const candidateAccount = await this.prisma.candidateAccount.findUnique({
      where: { id },
      select: this.defaultSelect,
    });

    if (!candidateAccount) {
      throw new NotFoundException('Candidate account not found');
    }

    return candidateAccount;
  }

  async update(id: string, updateCandidateAccountDto: UpdateCandidateAccountDto) {
    await this.findOne(id);

    const { password, ...data } = updateCandidateAccountDto;

    try {
      return await this.prisma.candidateAccount.update({
        where: { id },
        data: {
          ...data,
          email: data.email?.toLowerCase(),
          passwordHash: password ? await hash(password, 10) : undefined,
        },
        select: this.defaultSelect,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.candidateAccount.delete({
      where: { id },
      select: this.defaultSelect,
    });
  }

  private readonly defaultSelect = {
    id: true,
    fullName: true,
    email: true,
    authProvider: true,
    providerUserId: true,
    candidateAccountStatus: true,
    emailVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.CandidateAccountSelect;

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Tài khoản ứng viên đã tồn tại');
    }
  }
}
