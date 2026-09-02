import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../admin-users/admin-audit-log.service';
import { AssignAdminPermissionsDto } from './dto/assign-admin-permissions.dto';
import { CreateAdminPermissionDto } from './dto/create-admin-permission.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminPermissionDto } from './dto/update-admin-permission.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  // ─── Admin Roles ─────────────────────────────────────────────────────────

  async findAllRoles() {
    const roles = await this.prisma.adminRole.findMany({
      where: { deletedAt: null },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: {
            admins: { where: { deletedAt: null } },
            rolePermissions: true,
          },
        },
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return roles.map((role) => ({
      ...role,
      adminsCount: role._count.admins,
      permissionsCount: role._count.rolePermissions,
    }));
  }

  async findOneRole(id: string) {
    const role = await this.prisma.adminRole.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            admins: { where: { deletedAt: null } },
            rolePermissions: true,
          },
        },
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Không tìm thấy vai trò admin với ID: ${id}`);
    }

    return {
      ...role,
      adminsCount: role._count.admins,
      permissionsCount: role._count.rolePermissions,
    };
  }

  async createRole(createdByAdminId: string | null, dto: CreateAdminRoleDto) {
    const generatedRoleCode = (
      dto.roleCode?.trim() ||
      dto.roleName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
    )
      .toUpperCase()
      .replace(/_+/g, '_');

    if (generatedRoleCode === 'SUPER_ADMIN') {
      throw new ForbiddenException('Không thể tạo vai trò với mã SUPER_ADMIN.');
    }

    const existingCode = await this.prisma.adminRole.findFirst({
      where: { roleCode: generatedRoleCode, deletedAt: null },
    });
    if (existingCode) {
      throw new ConflictException(`Mã vai trò "${generatedRoleCode}" đã tồn tại.`);
    }

    const existingName = await this.prisma.adminRole.findFirst({
      where: { roleName: dto.roleName.trim(), deletedAt: null },
    });
    if (existingName) {
      throw new ConflictException(`Tên vai trò "${dto.roleName}" đã tồn tại.`);
    }

    let validPermissionIds: string[] = [];
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      const uniqueIds = Array.from(new Set(dto.permissionIds));
      const permissions = await this.prisma.adminPermission.findMany({
        where: { id: { in: uniqueIds } },
      });
      if (permissions.length !== uniqueIds.length) {
        throw new NotFoundException('Một hoặc nhiều quyền hạn được gán không tồn tại.');
      }
      validPermissionIds = uniqueIds;
    }

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.adminRole.create({
        data: {
          roleCode: generatedRoleCode,
          roleName: dto.roleName.trim(),
          description: dto.description?.trim() || null,
          status: dto.status || RoleStatus.ACTIVE,
          isSystem: false,
          createdByAdminId,
          rolePermissions:
            validPermissionIds.length > 0
              ? {
                  create: validPermissionIds.map((permissionId) => ({
                    permissionId,
                  })),
                }
              : undefined,
        },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      await this.auditLogService.log(
        {
          adminId: createdByAdminId,
          action: 'ROLE_CREATED',
          targetId: role.id,
          targetType: 'AdminRole',
          newValue: {
            roleCode: role.roleCode,
            roleName: role.roleName,
            status: role.status,
            permissionIds: validPermissionIds,
          },
        },
        tx,
      );

      return role;
    });
  }

  async updateRole(id: string, currentAdminId: string, dto: UpdateAdminRoleDto) {
    const existing = await this.ensureRoleExists(id);

    if (existing.roleCode === 'SUPER_ADMIN' && dto.status === RoleStatus.INACTIVE) {
      throw new ForbiddenException('Không thể vô hiệu hóa vai trò SUPER_ADMIN.');
    }

    if (dto.status === RoleStatus.INACTIVE && existing.status === RoleStatus.ACTIVE) {
      const activeAdminsCount = await this.prisma.adminUser.count({
        where: { roleId: id, status: 'ACTIVE', deletedAt: null },
      });
      if (activeAdminsCount > 0) {
        throw new BadRequestException(
          `Không thể vô hiệu hóa vai trò này vì đang có ${activeAdminsCount} tài khoản quản trị viên đang hoạt động sử dụng nó.`,
        );
      }
    }

    if (dto.roleName && dto.roleName.trim() !== existing.roleName) {
      const nameConflict = await this.prisma.adminRole.findFirst({
        where: {
          id: { not: id },
          roleName: dto.roleName.trim(),
          deletedAt: null,
        },
      });
      if (nameConflict) {
        throw new ConflictException(`Tên vai trò "${dto.roleName}" đã tồn tại.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminRole.update({
        where: { id },
        data: {
          roleName: dto.roleName ? dto.roleName.trim() : undefined,
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          status: dto.status,
        },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: dto.status !== existing.status ? 'ROLE_STATUS_CHANGED' : 'ROLE_UPDATED',
          targetId: id,
          targetType: 'AdminRole',
          oldValue: {
            roleName: existing.roleName,
            status: existing.status,
          },
          newValue: {
            roleName: updated.roleName,
            status: updated.status,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async removeRole(id: string, currentAdminId: string) {
    const existing = await this.ensureRoleExists(id);

    if (existing.isSystem || existing.roleCode === 'SUPER_ADMIN') {
      throw new ForbiddenException('Không thể xóa vai trò hệ thống mặc định.');
    }

    const adminsWithRole = await this.prisma.adminUser.count({
      where: { roleId: id, deletedAt: null },
    });

    if (adminsWithRole > 0) {
      throw new ConflictException(
        `Không thể xóa vai trò này vì đang có ${adminsWithRole} tài khoản quản trị viên sử dụng nó.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Soft delete role
      await tx.adminRole.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: RoleStatus.INACTIVE,
        },
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ROLE_ARCHIVED',
          targetId: id,
          targetType: 'AdminRole',
          oldValue: { roleCode: existing.roleCode, roleName: existing.roleName },
        },
        tx,
      );
    });
  }

  // ─── Admin Permissions ────────────────────────────────────────────────────

  async findAllPermissions() {
    return this.prisma.adminPermission.findMany({
      orderBy: [{ sortOrder: 'asc' }, { module: 'asc' }, { permissionCode: 'asc' }],
    });
  }

  async findOnePermission(id: string) {
    const permission = await this.prisma.adminPermission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Không tìm thấy quyền admin với ID: ${id}`);
    }

    return permission;
  }

  async createPermission(dto: CreateAdminPermissionDto) {
    return this.prisma.adminPermission
      .create({
        data: dto,
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`Mã quyền "${dto.permissionCode}" đã tồn tại.`);
        }
        throw e;
      });
  }

  async updatePermission(id: string, dto: UpdateAdminPermissionDto) {
    await this.ensurePermissionExists(id);

    return this.prisma.adminPermission
      .update({
        where: { id },
        data: dto,
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`Mã quyền "${dto.permissionCode}" đã tồn tại.`);
        }
        throw e;
      });
  }

  async removePermission(id: string) {
    await this.ensurePermissionExists(id);
    await this.prisma.adminPermission.delete({ where: { id } });
  }

  // ─── Assign Permissions to Role ───────────────────────────────────────────

  async assignPermissions(
    roleId: string,
    currentAdminId: string,
    dto: AssignAdminPermissionsDto,
  ) {
    const role = await this.ensureRoleExists(roleId);
    const uniqueIds = Array.from(new Set(dto.permissionIds));

    // Verify all permission IDs exist
    const permissions = await this.prisma.adminPermission.findMany({
      where: { id: { in: uniqueIds } },
    });

    if (permissions.length !== uniqueIds.length) {
      const found = permissions.map((p) => p.id);
      const missing = uniqueIds.filter((id) => !found.includes(id));
      throw new NotFoundException(`Không tìm thấy các quyền sau: ${missing.join(', ')}`);
    }

    // If SUPER_ADMIN, ensure mandatory permissions are not stripped
    if (role.roleCode === 'SUPER_ADMIN') {
      const allPermissionsCount = await this.prisma.adminPermission.count();
      if (uniqueIds.length < allPermissionsCount) {
        throw new ForbiddenException(
          'Không được phép gỡ các quyền quản trị tối cao khỏi vai trò SUPER_ADMIN.',
        );
      }
    }

    // Get old permissions for audit
    const oldRolePermissions = await this.prisma.adminRolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    const oldPermissionCodes = oldRolePermissions.map((rp) => rp.permission.permissionCode);
    const newPermissionCodes = permissions.map((p) => p.permissionCode);

    // Sync roles & permissions transactionally
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete all permissions for this role
      await tx.adminRolePermission.deleteMany({
        where: { roleId },
      });

      // 2. Create the new ones in bulk
      if (uniqueIds.length > 0) {
        await tx.adminRolePermission.createMany({
          data: uniqueIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }

      // Invalidate sessions of all admins having this role so changes take effect immediately
      await tx.adminUser.updateMany({
        where: { roleId, deletedAt: null },
        data: { tokenVersion: { increment: 1 } },
      });

      await this.auditLogService.log(
        {
          adminId: currentAdminId,
          action: 'ROLE_PERMISSIONS_SYNCED',
          targetId: roleId,
          targetType: 'AdminRole',
          oldValue: { permissionCodes: oldPermissionCodes },
          newValue: { permissionCodes: newPermissionCodes },
        },
        tx,
      );
    });

    return this.findOneRole(roleId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.adminRole.findFirst({
      where: { id, deletedAt: null },
    });
    if (!role) {
      throw new NotFoundException(`Không tìm thấy vai trò admin với ID: ${id}`);
    }
    return role;
  }

  private async ensurePermissionExists(id: string) {
    const permission = await this.prisma.adminPermission.findUnique({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException(`Không tìm thấy quyền admin với ID: ${id}`);
    }
    return permission;
  }
}
