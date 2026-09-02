import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminStatus, Prisma, RoleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminAccountQueryDto } from './dto/admin-account-query.dto';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { ResetAdminPasswordDto } from './dto/reset-admin-password.dto';
import { UpdateAdminAccountDto } from './dto/update-admin-account.dto';

const ADMIN_SELECT_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  status: true,
  roleId: true,
  createdByAdminId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      roleCode: true,
      roleName: true,
      description: true,
      isSystem: true,
      status: true,
      rolePermissions: {
        select: {
          permission: {
            select: {
              id: true,
              permissionName: true,
              permissionCode: true,
              module: true,
            },
          },
        },
      },
    },
  },
  createdByAdmin: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
} as const;

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  async findAll(query: AdminAccountQueryDto) {
    const { page = 1, limit = 20, q, roleId, status } = query;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.AdminUserWhereInput = {
      deletedAt: null,
    };

    if (roleId) {
      where.roleId = roleId;
    }

    if (status) {
      where.status = status;
    }

    if (q && q.trim()) {
      const search = q.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.adminUser.count({ where }),
      this.prisma.adminUser.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        select: ADMIN_SELECT_FIELDS,
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const admin = await this.prisma.adminUser.findFirst({
      where: { id, deletedAt: null },
      select: ADMIN_SELECT_FIELDS,
    });

    if (!admin) {
      throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
    }

    return admin;
  }

  async create(creatorAdminId: string, dto: CreateAdminAccountDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.prisma.adminUser.findFirst({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException(`Email "${normalizedEmail}" đã được sử dụng.`);
    }

    if (dto.roleId) {
      const role = await this.prisma.adminRole.findFirst({
        where: { id: dto.roleId, deletedAt: null },
      });
      if (!role) {
        throw new NotFoundException(`Không tìm thấy vai trò với ID: ${dto.roleId}`);
      }
      if (role.status !== RoleStatus.ACTIVE) {
        throw new BadRequestException('Không thể gán vai trò đang ở trạng thái không hoạt động.');
      }
    }

    const passwordHash = await this.authService.hashPassword(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.create({
        data: {
          email: normalizedEmail,
          fullName: dto.fullName.trim(),
          passwordHash,
          phone: dto.phone?.trim() || null,
          avatarUrl: dto.avatarUrl?.trim() || null,
          roleId: dto.roleId || null,
          status: dto.status || AdminStatus.ACTIVE,
          createdByAdminId: creatorAdminId,
          tokenVersion: 0,
        },
        select: ADMIN_SELECT_FIELDS,
      });

      await this.auditLogService.log(
        {
          adminId: creatorAdminId,
          action: 'ADMIN_CREATED',
          targetId: admin.id,
          targetType: 'AdminUser',
          newValue: {
            id: admin.id,
            email: admin.email,
            fullName: admin.fullName,
            roleId: admin.roleId,
            status: admin.status,
          },
        },
        tx,
      );

      return admin;
    });

    return created;
  }

  async update(id: string, currentAdminId: string, dto: UpdateAdminAccountDto) {
    return this.prisma.$transaction(async (tx) => {
      // Fetch target with row-level lock or fresh read inside tx
      const existing = await tx.adminUser.findFirst({
        where: { id, deletedAt: null },
        include: { role: true },
      });

      if (!existing) {
        throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
      }

      let roleChanged = false;
      let statusChanged = false;

      // 1. Role Change validation
      if (dto.roleId !== undefined && dto.roleId !== existing.roleId) {
        roleChanged = true;
        if (dto.roleId) {
          const role = await tx.adminRole.findFirst({
            where: { id: dto.roleId, deletedAt: null },
          });
          if (!role) {
            throw new NotFoundException(`Không tìm thấy vai trò với ID: ${dto.roleId}`);
          }
          if (role.status !== RoleStatus.ACTIVE) {
            throw new BadRequestException('Không thể gán vai trò đang ở trạng thái không hoạt động.');
          }
        }

        // If target was SUPER_ADMIN, check if demoting will leave zero active Super Admins
        if (existing.role?.roleCode === 'SUPER_ADMIN') {
          await this.assertOtherActiveSuperAdminsExist(id, tx);
        }
      }

      // 2. Status Change validation
      if (dto.status && dto.status !== existing.status) {
        statusChanged = true;
        if (dto.status !== AdminStatus.ACTIVE && existing.status === AdminStatus.ACTIVE) {
          if (id === currentAdminId) {
            throw new BadRequestException('Không thể tự khóa hoặc vô hiệu hóa tài khoản của chính mình.');
          }

          if (existing.role?.roleCode === 'SUPER_ADMIN') {
            await this.assertOtherActiveSuperAdminsExist(id, tx);
          }
        }
      }

      const updateData: Prisma.AdminUserUpdateInput = {};

      if (dto.fullName !== undefined) updateData.fullName = dto.fullName.trim();
      if (dto.phone !== undefined) updateData.phone = dto.phone?.trim() || null;
      if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl?.trim() || null;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.roleId !== undefined) {
        updateData.role = dto.roleId ? { connect: { id: dto.roleId } } : { disconnect: true };
      }

      // Invalidate existing sessions if role or status changed
      if (roleChanged || (statusChanged && dto.status !== AdminStatus.ACTIVE)) {
        updateData.tokenVersion = { increment: 1 };
      }

      const updated = await tx.adminUser.update({
        where: { id },
        data: updateData,
        select: ADMIN_SELECT_FIELDS,
      });

      const action = roleChanged
        ? 'ADMIN_ROLE_CHANGED'
        : statusChanged && dto.status === AdminStatus.LOCKED
          ? 'ADMIN_LOCKED'
          : 'ADMIN_UPDATED';

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action,
          targetId: id,
          targetType: 'AdminUser',
          oldValue: {
            fullName: existing.fullName,
            phone: existing.phone,
            roleId: existing.roleId,
            status: existing.status,
          },
          newValue: {
            fullName: updated.fullName,
            phone: updated.phone,
            roleId: updated.roleId,
            status: updated.status,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async resetPassword(id: string, currentAdminId: string, dto: ResetAdminPasswordDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
      }

      const passwordHash = await this.authService.hashPassword(dto.newPassword);

      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 }, // Invalidate old session
        },
        select: ADMIN_SELECT_FIELDS,
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ADMIN_PASSWORD_RESET',
          targetId: id,
          targetType: 'AdminUser',
          newValue: { resetBy: currentAdminId, timestamp: new Date() },
        },
        tx,
      );

      return updated;
    });
  }

  async lock(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new BadRequestException('Không thể tự khóa tài khoản của chính mình.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findFirst({
        where: { id, deletedAt: null },
        include: { role: true },
      });

      if (!existing) {
        throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
      }

      if (existing.role?.roleCode === 'SUPER_ADMIN') {
        await this.assertOtherActiveSuperAdminsExist(id, tx);
      }

      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          status: AdminStatus.LOCKED,
          tokenVersion: { increment: 1 }, // Invalidate session
        },
        select: ADMIN_SELECT_FIELDS,
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ADMIN_LOCKED',
          targetId: id,
          targetType: 'AdminUser',
          oldValue: { status: existing.status },
          newValue: { status: AdminStatus.LOCKED },
        },
        tx,
      );

      return updated;
    });
  }

  async unlock(id: string, currentAdminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
      }

      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          status: AdminStatus.ACTIVE,
        },
        select: ADMIN_SELECT_FIELDS,
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ADMIN_UNLOCKED',
          targetId: id,
          targetType: 'AdminUser',
          oldValue: { status: existing.status },
          newValue: { status: AdminStatus.ACTIVE },
        },
        tx,
      );

      return updated;
    });
  }

  async remove(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new BadRequestException('Không thể xóa tài khoản của chính mình.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findFirst({
        where: { id, deletedAt: null },
        include: { role: true },
      });

      if (!existing) {
        throw new NotFoundException(`Không tìm thấy tài khoản quản trị viên với ID: ${id}`);
      }

      if (existing.role?.roleCode === 'SUPER_ADMIN') {
        await this.assertOtherActiveSuperAdminsExist(id, tx);
      }

      // Soft delete
      await tx.adminUser.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: AdminStatus.INACTIVE,
          tokenVersion: { increment: 1 },
        },
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ADMIN_ARCHIVED',
          targetId: id,
          targetType: 'AdminUser',
          oldValue: { status: existing.status, email: existing.email },
          newValue: { status: AdminStatus.INACTIVE, deletedAt: new Date() },
        },
        tx,
      );
    });
  }

  private async assertOtherActiveSuperAdminsExist(
    targetAdminId: string,
    tx: Prisma.TransactionClient,
  ) {
    const activeSuperAdmins = await tx.adminUser.count({
      where: {
        id: { not: targetAdminId },
        status: AdminStatus.ACTIVE,
        deletedAt: null,
        role: {
          roleCode: 'SUPER_ADMIN',
          status: RoleStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });

    if (activeSuperAdmins === 0) {
      throw new ForbiddenException(
        'Hệ thống bắt buộc phải duy trì ít nhất một tài khoản Super Admin hoạt động (ACTIVE).',
      );
    }
  }
}
