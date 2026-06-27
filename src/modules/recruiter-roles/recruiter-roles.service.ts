import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRecruiterPermissionDto } from './dto/create-recruiter-permission.dto';
import { CreateRecruiterRoleDto } from './dto/create-recruiter-role.dto';
import { UpdateRecruiterPermissionDto } from './dto/update-recruiter-permission.dto';
import { UpdateRecruiterRoleDto } from './dto/update-recruiter-role.dto';

@Injectable()
export class RecruiterRolesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Recruiter Roles ─────────────────────────────────────────────────────

  async findAllRoles() {
    return this.prisma.recruiterRole.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        rolePermissions: {
          include: {
            recruiterPermission: true,
          },
        },
      },
    });
  }

  async findOneRole(id: string) {
    const role = await this.prisma.recruiterRole.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { recruiterPermission: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Recruiter role ${id} not found`);
    }

    return role;
  }

  async createRole(dto: CreateRecruiterRoleDto) {
    return this.prisma.recruiterRole.create({ data: dto }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Recruiter role with code "${dto.code}" already exists`);
      }
      throw e;
    });
  }

  async updateRole(id: string, dto: UpdateRecruiterRoleDto) {
    await this.ensureRoleExists(id);

    return this.prisma.recruiterRole.update({ where: { id }, data: dto }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Recruiter role with code "${dto.code}" already exists`);
      }
      throw e;
    });
  }

  async removeRole(id: string) {
    await this.ensureRoleExists(id);
    await this.prisma.recruiterRole.delete({ where: { id } });
  }

  // ─── Recruiter Permissions ────────────────────────────────────────────────

  async findAllPermissions() {
    return this.prisma.recruiterPermission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async findOnePermission(id: string) {
    const permission = await this.prisma.recruiterPermission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Recruiter permission ${id} not found`);
    }

    return permission;
  }

  async createPermission(dto: CreateRecruiterPermissionDto) {
    return this.prisma.recruiterPermission.create({ data: dto }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Permission with code "${dto.code}" already exists`);
      }
      throw e;
    });
  }

  async updatePermission(id: string, dto: UpdateRecruiterPermissionDto) {
    await this.ensurePermissionExists(id);

    return this.prisma.recruiterPermission
      .update({ where: { id }, data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(`Permission with code "${dto.code}" already exists`);
        }
        throw e;
      });
  }

  async removePermission(id: string) {
    await this.ensurePermissionExists(id);
    await this.prisma.recruiterPermission.delete({ where: { id } });
  }

  // ─── Assign Permissions to Role ───────────────────────────────────────────

  async assignPermissions(roleId: string, dto: AssignPermissionsDto) {
    await this.ensureRoleExists(roleId);

    // Verify all permission IDs exist
    const permissions = await this.prisma.recruiterPermission.findMany({
      where: { id: { in: dto.permissionIds } },
    });

    if (permissions.length !== dto.permissionIds.length) {
      const found = permissions.map((p) => p.id);
      const missing = dto.permissionIds.filter((id) => !found.includes(id));
      throw new NotFoundException(`Permissions not found: ${missing.join(', ')}`);
    }

    // Upsert each permission assignment (ignore already-assigned ones)
    await this.prisma.$transaction(
      dto.permissionIds.map((permissionId) =>
        this.prisma.recruiterRolePermission.upsert({
          where: {
            recruiterRoleId_recruiterPermissionId: {
              recruiterRoleId: roleId,
              recruiterPermissionId: permissionId,
            },
          },
          create: {
            recruiterRoleId: roleId,
            recruiterPermissionId: permissionId,
          },
          update: {},
        }),
      ),
    );

    return this.findOneRole(roleId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureRoleExists(id: string) {
    const role = await this.prisma.recruiterRole.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Recruiter role ${id} not found`);
    }
    return role;
  }

  private async ensurePermissionExists(id: string) {
    const permission = await this.prisma.recruiterPermission.findUnique({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException(`Recruiter permission ${id} not found`);
    }
    return permission;
  }
}
