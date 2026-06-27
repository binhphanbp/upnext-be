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
    const admin = await this.prisma.adminUser.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        status: AdminStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        roleId: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');
    }

    await this.authService.verifyPassword(dto.password, admin.passwordHash);

    return this.authService.signAccessToken({
      id: admin.id,
      email: admin.email,
      role: ActorType.ADMIN,
      adminRoleId: admin.roleId,
    });
  }
}
