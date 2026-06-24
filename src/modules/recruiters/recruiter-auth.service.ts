import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, ActorType, Prisma } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { RequestPasswordResetDto } from '../auth/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { LoginResponse } from '../auth/entities/auth.entity';
import {
  PasswordResetRequestResponse,
  PasswordResetResponse,
} from '../auth/entities/password-reset.entity';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';

@Injectable()
export class RecruiterAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterRecruiterDto): Promise<LoginResponse> {
    try {
      const account = await this.prisma.recruiterAccount.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: await this.authService.hashPassword(dto.password),
          status: AccountStatus.ACTIVE,
        },
        select: {
          id: true,
          email: true,
          companyId: true,
          recruiterRoleId: true,
        },
      });

      return this.authService.signAccessToken({
        id: account.id,
        email: account.email,
        role: ActorType.RECRUITER,
        companyId: account.companyId,
        recruiterRoleId: account.recruiterRoleId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tài khoản nhà tuyển dụng đã tồn tại');
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const account = await this.prisma.recruiterAccount.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        status: AccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        companyId: true,
        recruiterRoleId: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.authService.verifyPassword(dto.password, account.passwordHash);

    return this.authService.signAccessToken({
      id: account.id,
      email: account.email,
      role: ActorType.RECRUITER,
      companyId: account.companyId,
      recruiterRoleId: account.recruiterRoleId,
    });
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<PasswordResetRequestResponse> {
    const account = await this.prisma.recruiterAccount.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        status: AccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (account) {
      const token = await this.authService.signPasswordResetToken({
        id: account.id,
        email: account.email,
        role: ActorType.RECRUITER,
      });

      await this.emailService.sendPasswordReset({
        to: account.email,
        resetLink: this.buildPasswordResetLink('recruiter', token),
        actor: 'recruiter',
      });
    }

    return {
      message: 'Nếu email tồn tại, hệ thống đã gửi link đặt lại mật khẩu đến email của bạn.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<PasswordResetResponse> {
    const payload = await this.authService.verifyPasswordResetToken(dto.token, ActorType.RECRUITER);

    const account = await this.prisma.recruiterAccount.findFirst({
      where: {
        id: payload.sub,
        email: payload.email,
        status: AccountStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!account) {
      throw new UnauthorizedException('Token đặt lại mật khẩu không hợp lệ');
    }

    await this.prisma.recruiterAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: await this.authService.hashPassword(dto.password),
      },
    });

    return { message: 'Đặt lại mật khẩu thành công.' };
  }

  private buildPasswordResetLink(actor: 'recruiter', token: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const url = new URL(`/vi/${actor}/reset-password`, frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
