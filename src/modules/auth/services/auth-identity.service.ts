import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AccountStatus, ActorType, AdminStatus, RoleStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.types';

@Injectable()
export class AuthIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveJwtPayload(payload: JwtPayload): Promise<AuthenticatedUser> {
    switch (payload.role) {
      case ActorType.CANDIDATE:
        return this.resolveCandidate(payload);
      case ActorType.RECRUITER:
        return this.resolveRecruiter(payload);
      case ActorType.ADMIN:
        return this.resolveAdmin(payload);
      default:
        throw new UnauthorizedException('Invalid token actor');
    }
  }

  private async resolveCandidate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const account = await this.prisma.candidateAccount.findFirst({
      where: {
        id: payload.sub,
        email: payload.email,
        candidateAccountStatus: AccountStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });

    if (!account) throw new UnauthorizedException('Invalid token');
    return { id: account.id, email: account.email, role: ActorType.CANDIDATE, permissions: [] };
  }

  private async resolveRecruiter(payload: JwtPayload): Promise<AuthenticatedUser> {
    const account = await this.prisma.recruiterAccount.findFirst({
      where: { id: payload.sub, email: payload.email, status: AccountStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        companyId: true,
        recruiterRoleId: true,
        recruiterRole: {
          select: {
            rolePermissions: {
              select: { recruiterPermission: { select: { code: true } } },
            },
          },
        },
      },
    });

    if (!account) throw new UnauthorizedException('Invalid token');
    return {
      id: account.id,
      email: account.email,
      role: ActorType.RECRUITER,
      companyId: account.companyId,
      recruiterRoleId: account.recruiterRoleId,
      permissions:
        account.recruiterRole?.rolePermissions.map((entry) => entry.recruiterPermission.code) ?? [],
    };
  }

  private async resolveAdmin(payload: JwtPayload): Promise<AuthenticatedUser> {
    const account = await this.prisma.adminUser.findFirst({
      where: { id: payload.sub, email: payload.email, status: AdminStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        roleId: true,
        role: {
          select: {
            status: true,
            rolePermissions: {
              select: { permission: { select: { permissionCode: true } } },
            },
          },
        },
      },
    });

    if (!account || (account.role && account.role.status !== RoleStatus.ACTIVE)) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: account.id,
      email: account.email,
      role: ActorType.ADMIN,
      adminRoleId: account.roleId,
      permissions:
        account.role?.rolePermissions.map((entry) => entry.permission.permissionCode) ?? [],
    };
  }
}
