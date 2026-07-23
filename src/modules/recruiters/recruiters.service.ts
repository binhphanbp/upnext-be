import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListRecruiterAccountsQueryDto } from './dto/recruiter-accounts/list-recruiter-accounts-query.dto';
import { UpdateRecruiterAccountDto } from './dto/recruiter-accounts/update-recruiter-account.dto';
import { ChangePasswordDto } from './dto/recruiter-accounts/change-password.dto';
import { CreateRecruiterProfileDto } from './dto/recruiter-profiles/create-recruiter-profile.dto';
import { UpdateRecruiterProfileDto } from './dto/recruiter-profiles/update-recruiter-profile.dto';

@Injectable()
export class RecruitersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Recruiter Accounts ───────────────────────────────────────────────────

  async findAllAccounts(query: ListRecruiterAccountsQueryDto) {
    const where: Prisma.RecruiterAccountWhereInput = {
      ...(query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.recruiterAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toPagination(query),
        include: {
          profile: true,
          recruiterRole: true,
          company: { select: { id: true, name: true } },
        },
      }),
      this.prisma.recruiterAccount.count({ where }),
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

  async findOneAccount(id: string, user: AuthenticatedUser) {
    if (user.role !== ActorType.ADMIN && id !== user.id) {
      throw new ForbiddenException('You can only view your own account');
    }

    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id },
      include: {
        profile: true,
        recruiterRole: true,
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            verificationStatus: true,
            businessLicenseFileId: true,
            reputationScore: true,
            restrictedAt: true,
          },
        },
        companyMembers: true,
      },
    });

    if (!account) {
      throw new NotFoundException(`Recruiter account ${id} not found`);
    }

    return account;
  }

  async updateAccount(id: string, dto: UpdateRecruiterAccountDto, user: AuthenticatedUser) {
    await this.ensureAccountExists(id);

    const isAdmin = user.role === ActorType.ADMIN;

    if (!isAdmin) {
      // Non-admin recruiters may only update their own account...
      if (id !== user.id) {
        throw new ForbiddenException('You can only update your own account');
      }
      // ...and must never change privileged fields (company, role, status).
      if (
        dto.companyId !== undefined ||
        dto.recruiterRoleId !== undefined ||
        dto.status !== undefined
      ) {
        throw new ForbiddenException(
          'You are not allowed to change company, role or account status',
        );
      }
    }

    if (isAdmin && dto.companyId) {
      const existingMember = await this.prisma.companyMember.findFirst({
        where: { recruiterAccountId: id, companyId: dto.companyId },
      });

      if (!existingMember) {
        const ownerRole = await this.prisma.recruiterRole.findFirst({
          where: { code: 'OWNER' },
        });

        if (ownerRole) {
          await this.prisma.companyMember.create({
            data: {
              recruiterAccountId: id,
              companyId: dto.companyId,
              roleId: ownerRole.id,
              status: 'ACTIVE',
              joinedAt: new Date(),
            },
          });
        }
      }
    }

    return this.prisma.recruiterAccount.update({
      where: { id },
      data: dto,
      include: {
        profile: true,
        recruiterRole: true,
        company: { select: { id: true, name: true } },
      },
    });
  }

  async deactivateAccount(id: string) {
    await this.ensureAccountExists(id);

    return this.prisma.recruiterAccount.update({
      where: { id },
      data: { status: 'BANNED' },
    });
  }

  // ─── Recruiter Profiles ───────────────────────────────────────────────────

  async createProfile(dto: CreateRecruiterProfileDto) {
    await this.ensureAccountExists(dto.recruiterAccountId);

    const existing = await this.prisma.recruiterProfile.findUnique({
      where: { recruiterAccountId: dto.recruiterAccountId },
    });

    if (existing) {
      throw new ConflictException(
        `Profile for recruiter account ${dto.recruiterAccountId} already exists`,
      );
    }

    return this.prisma.recruiterProfile.create({
      data: dto,
    });
  }

  async findMyProfile(accountId: string) {
    const profile = await this.prisma.recruiterProfile.findUnique({
      where: { recruiterAccountId: accountId },
      include: {
        recruiterAccount: {
          select: {
            id: true,
            email: true,
            status: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException(`Profile for recruiter account ${accountId} not found`);
    }

    return profile;
  }

  async findOneProfile(id: string, user: AuthenticatedUser) {
    const profile = await this.prisma.recruiterProfile.findUnique({
      where: { id },
      include: {
        recruiterAccount: {
          select: {
            id: true,
            email: true,
            status: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException(`Recruiter profile ${id} not found`);
    }

    if (user.role !== ActorType.ADMIN && profile.recruiterAccountId !== user.id) {
      throw new ForbiddenException('You can only view your own profile');
    }

    return profile;
  }

  async updateProfile(id: string, dto: UpdateRecruiterProfileDto, user: AuthenticatedUser) {
    const profile = await this.ensureProfileExists(id);

    if (user.role !== ActorType.ADMIN && profile.recruiterAccountId !== user.id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return this.prisma.recruiterProfile.update({
      where: { id },
      data: dto,
    });
  }

  async removeProfile(id: string) {
    await this.ensureProfileExists(id);
    await this.prisma.recruiterProfile.delete({ where: { id } });
  }

  async getDashboardStats(recruiterId: string, user: AuthenticatedUser) {
    if (user.role !== ActorType.ADMIN && recruiterId !== user.id) {
      throw new ForbiddenException('You can only view your own dashboard stats');
    }
    await this.ensureAccountExists(recruiterId);

    const [totalJobPosts, totalCandidates] = await Promise.all([
      this.prisma.jobPost.count({
        where: {
          createdByRecruiterId: recruiterId,
          deletedAt: null,
        },
      }),
      this.prisma.application.count({
        where: {
          jobPost: {
            createdByRecruiterId: recruiterId,
            deletedAt: null,
          },
        },
      }),
    ]);

    return {
      totalJobPosts,
      totalCandidates,
    };
  }

  async changePassword(id: string, dto: ChangePasswordDto, user: AuthenticatedUser) {
    if (id !== user.id) {
      throw new ForbiddenException('You can only change your own password');
    }

    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    });

    if (!account) {
      throw new NotFoundException(`Recruiter account ${id} not found`);
    }

    if (!account.passwordHash) {
      throw new BadRequestException(
        'Tài khoản đăng nhập bằng Google chưa thiết lập mật khẩu. Vui lòng đặt lại mật khẩu để tạo mới.',
      );
    }

    const isPasswordValid = await compare(dto.currentPassword, account.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const newPasswordHash = await hash(dto.newPassword, 10);
    await this.prisma.recruiterAccount.update({
      where: { id },
      data: { passwordHash: newPasswordHash },
    });

    return { message: 'Đổi mật khẩu thành công' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureAccountExists(id: string) {
    const account = await this.prisma.recruiterAccount.findUnique({ where: { id } });

    if (!account) {
      throw new NotFoundException(`Recruiter account ${id} not found`);
    }

    return account;
  }

  private async ensureProfileExists(id: string) {
    const profile = await this.prisma.recruiterProfile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException(`Recruiter profile ${id} not found`);
    }

    return profile;
  }
}
