import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignAdminPermissionsDto } from './dto/assign-admin-permissions.dto';
import { CreateAdminPermissionDto } from './dto/create-admin-permission.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminPermissionDto } from './dto/update-admin-permission.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin Roles ─────────────────────────────────────────────────────────

  async findAllRoles() {
    return this.prisma.adminRole.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findOneRole(id: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id },
      include: {
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

    return role;
  }

  async createRole(createdByAdminId: string | null, dto: CreateAdminRoleDto) {
    return this.prisma.adminRole
      .create({
        data: {
          roleName: dto.roleName,
          description: dto.description,
          status: dto.status,
          createdByAdminId,
        },
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`Tên vai trò "${dto.roleName}" đã tồn tại.`);
        }
        throw e;
      });
  }

  async updateRole(id: string, dto: UpdateAdminRoleDto) {
    await this.ensureRoleExists(id);

    return this.prisma.adminRole
      .update({
        where: { id },
        data: dto,
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`Tên vai trò "${dto.roleName}" đã tồn tại.`);
        }
        throw e;
      });
  }

  async removeRole(id: string) {
    await this.ensureRoleExists(id);

    // Verify if there are admins assigned to this role
    const adminsWithRole = await this.prisma.adminUser.count({
      where: { roleId: id },
    });

    if (adminsWithRole > 0) {
      throw new ConflictException(
        `Không thể xóa vai trò này vì đang có ${adminsWithRole} tài khoản admin sử dụng nó.`,
      );
    }

    await this.prisma.adminRole.delete({ where: { id } });
  }

  // ─── Admin Permissions ────────────────────────────────────────────────────

  async findAllPermissions() {
    return this.prisma.adminPermission.findMany({
      orderBy: [{ module: 'asc' }, { permissionCode: 'asc' }],
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

  async assignPermissions(roleId: string, dto: AssignAdminPermissionsDto) {
    await this.ensureRoleExists(roleId);

    // Verify all permission IDs exist
    const permissions = await this.prisma.adminPermission.findMany({
      where: { id: { in: dto.permissionIds } },
    });

    if (permissions.length !== dto.permissionIds.length) {
      const found = permissions.map((p) => p.id);
      const missing = dto.permissionIds.filter((id) => !found.includes(id));
      throw new NotFoundException(`Không tìm thấy các quyền sau: ${missing.join(', ')}`);
    }

    // Sync roles & permissions using a database transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete all permissions for this role that are not in the new list
      await tx.adminRolePermission.deleteMany({
        where: {
          roleId,
          permissionId: { notIn: dto.permissionIds },
        },
      });

      // 2. Upsert/create the new ones
      for (const permissionId of dto.permissionIds) {
        await tx.adminRolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId,
            },
          },
          create: {
            roleId,
            permissionId,
          },
          update: {},
        });
      }
    });

    return this.findOneRole(roleId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.adminRole.findUnique({ where: { id } });
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
