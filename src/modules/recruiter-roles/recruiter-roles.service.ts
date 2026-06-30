import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
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

  async findAllRoles(user: AuthenticatedUser) {
    return this.prisma.recruiterRole.findMany({
      where:
        user.role === ActorType.RECRUITER
          ? {
              OR: [{ companyId: null }, { companyId: user.companyId ?? undefined }],
            }
          : undefined,
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

  async createRole(user: AuthenticatedUser, dto: CreateRecruiterRoleDto) {
    const companyId = await this.ensureOwnerCanManageRoles(user);
    const code = this.createCustomRoleCode(dto.name, companyId, dto.code);

    const existing = await this.prisma.recruiterRole.findFirst({
      where: { companyId, name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Recruiter role with name "${dto.name}" already exists`);
    }

    return this.prisma.recruiterRole.create({
      data: {
        code,
        name: dto.name,
        description: dto.description,
        companyId,
      },
      include: {
        rolePermissions: {
          include: { recruiterPermission: true },
        },
      },
    });
  }

  async updateRole(user: AuthenticatedUser, id: string, dto: UpdateRecruiterRoleDto) {
    const role = await this.ensureRoleExists(id);
    await this.ensureOwnerCanManageRoles(user, role.companyId);
    this.ensureCustomRole(role);

    return this.prisma.recruiterRole.update({ where: { id }, data: dto }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Recruiter role with code "${dto.code}" already exists`);
      }
      throw e;
    });
  }

  async removeRole(user: AuthenticatedUser, id: string) {
    const role = await this.ensureRoleExists(id);
    await this.ensureOwnerCanManageRoles(user, role.companyId);
    this.ensureCustomRole(role);
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

  async assignPermissions(user: AuthenticatedUser, roleId: string, dto: AssignPermissionsDto) {
    const role = await this.ensureRoleExists(roleId);
    await this.ensureOwnerCanManageRoles(user, role.companyId);
    this.ensureCustomRole(role);

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

  private async ensureOwnerCanManageRoles(
    user: AuthenticatedUser,
    targetCompanyId?: string | null,
  ) {
    if (user.role === ActorType.ADMIN) {
      if (!targetCompanyId && !user.companyId) {
        throw new BadRequestException('Company context is required to manage recruiter roles');
      }
      return targetCompanyId ?? user.companyId!;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Recruiter account is not attached to a company');
    }

    if (targetCompanyId && targetCompanyId !== user.companyId) {
      throw new ForbiddenException('You can only manage roles in your company');
    }

    const member = await this.prisma.companyMember.findFirst({
      where: {
        companyId: user.companyId,
        recruiterAccountId: user.id,
      },
      include: { role: true },
    });

    if (member?.role?.code !== 'OWNER') {
      throw new ForbiddenException('Only the company Owner can manage roles');
    }

    return user.companyId;
  }

  private ensureCustomRole(role: { companyId: string | null; code: string }) {
    if (!role.companyId || ['OWNER', 'HR', 'TECHLEAD'].includes(role.code)) {
      throw new ForbiddenException('Default recruiter roles cannot be modified');
    }
  }

  private createCustomRoleCode(name: string, companyId: string, explicitCode?: string) {
    const source = explicitCode || name;
    const normalized = source
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/Đ/g, 'D')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);

    return `${normalized || 'CUSTOM'}_${companyId.replace(/-/g, '').slice(0, 12)}`;
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
