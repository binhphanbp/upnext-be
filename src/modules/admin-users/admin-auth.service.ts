import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, AdminStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminLoginResponse } from '../auth/entities/auth.entity';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async login(dto: LoginDto): Promise<AdminLoginResponse> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const admin = await this.prisma.adminUser.findFirst({
      where: {
        email: normalizedEmail,
        status: AdminStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        roleId: true,
        tokenVersion: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');
    }

    await this.authService.verifyPassword(dto.password, admin.passwordHash);

    // Record lastLoginAt
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return this.authService.signAccessToken({
      id: admin.id,
      email: admin.email,
      role: ActorType.ADMIN,
      adminRoleId: admin.roleId,
      tokenVersion: admin.tokenVersion,
    });
  }

  async getProfile(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        status: true,
        lastLoginAt: true,
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
                    permissionCode: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa');
    }

    const permissions = admin.role?.rolePermissions.map((rp) => rp.permission.permissionCode) || [];
    const { rolePermissions: _rolePermissions, ...roleWithoutRP } = admin.role || {};

    return {
      data: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        phone: admin.phone,
        avatarUrl: admin.avatarUrl,
        status: admin.status,
        lastLoginAt: admin.lastLoginAt,
        role: admin.role ? roleWithoutRP : null,
        permissions,
      },
    };
  }
}
