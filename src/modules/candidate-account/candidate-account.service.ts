import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidateAccountDto } from './dto/create-candidate-account.dto';
import { UpdateCandidateAccountStatusDto } from './dto/update-candidate-account-status.dto';
import { UpdateMyCandidateAccountDto } from './dto/update-my-candidate-account.dto';

@Injectable()
export class CandidateAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCandidateAccountDto) {
    try {
      return await this.prisma.candidateAccount.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
          authProvider: dto.authProvider || 'DEFAULT',
          providerUserId: dto.providerUserId,
          candidateAccountStatus: (dto.candidateAccountStatus as any) || 'ACTIVE',
          emailVerifiedAt: new Date(),
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

  async updateMe(id: string, dto: UpdateMyCandidateAccountDto) {
    await this.findOne(id);

    try {
      return await this.prisma.candidateAccount.update({
        where: { id },
        data: {
          passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
        },
        select: this.defaultSelect,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async updateStatus(id: string, dto: UpdateCandidateAccountStatusDto) {
    await this.findOne(id);

    return this.prisma.candidateAccount.update({
      where: { id },
      data: {
        candidateAccountStatus: dto.candidateAccountStatus,
      },
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
