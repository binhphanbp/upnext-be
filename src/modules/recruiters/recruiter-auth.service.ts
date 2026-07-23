import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, ActorType, AuthProvider, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { RequestPasswordResetDto } from '../auth/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { RecruiterLoginResponse, RecruiterRegisterResponse } from '../auth/entities/auth.entity';
import {
  PasswordResetRequestResponse,
  PasswordResetResponse,
} from '../auth/entities/password-reset.entity';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { RecruiterRefreshTokenDto } from './dto/recruiter-refresh-token.dto';
import { VerifyRecruiterEmailDto } from './dto/recruiter-accounts/verify-recruiter-email.dto';
import {
  RecruiterEmailVerificationRequest,
  RecruiterEmailVerificationResult,
} from './entities/recruiter-email-verification.entity';

type RecruiterTokenAccount = {
  id: string;
  email: string;
  companyId?: string | null;
  recruiterRoleId?: string | null;
};

@Injectable()
export class RecruiterAuthService {
  private readonly logger = new Logger(RecruiterAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterRecruiterDto): Promise<RecruiterRegisterResponse> {
    try {
      const ownerRole = await this.prisma.recruiterRole.findFirst({
        where: { code: 'OWNER' },
        select: { id: true },
      });
      if (!ownerRole) {
        this.logger.warn(
          'OWNER recruiter role not found — new recruiter account will have no permissions until manually assigned a role',
        );
      }

      const account = await this.prisma.recruiterAccount.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: await this.authService.hashPassword(dto.password),
          status: AccountStatus.ACTIVE,
          ...(ownerRole ? { recruiterRoleId: ownerRole.id } : {}),
        },
        select: {
          id: true,
          email: true,
        },
      });

      // Send verification email during registration
      const verificationToken = await this.authService.signEmailVerificationToken({
        id: account.id,
        email: account.email,
        role: ActorType.RECRUITER,
      });
      const verificationLink = this.buildEmailVerificationLink(verificationToken);
      await this.emailService.sendRecruiterEmailVerification({
        to: account.email,
        recruiterName: account.email,
        verificationLink,
      });

      // Không phát access/refresh token khi email chưa được xác thực —
      // người dùng phải verify email rồi đăng nhập.
      return {
        email: account.email,
        emailVerified: false,
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tài khoản nhà tuyển dụng đã tồn tại');
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<RecruiterLoginResponse> {
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
        emailVerifiedAt: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.authService.verifyPassword(dto.password, account.passwordHash);

    if (!account.emailVerifiedAt) {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa được xác thực email. Vui lòng xác thực email trước khi đăng nhập.',
      );
    }

    return this.issueRecruiterTokens(account);
  }

  async refresh(dto: RecruiterRefreshTokenDto): Promise<RecruiterLoginResponse> {
    const { id, secret } = this.parseRefreshToken(dto.refreshToken);
    const refreshToken = await this.prisma.recruiterRefreshToken.findUnique({
      where: { id },
      include: {
        recruiterAccount: {
          select: {
            id: true,
            email: true,
            companyId: true,
            recruiterRoleId: true,
            status: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (
      !refreshToken ||
      refreshToken.expiresAt <= new Date() ||
      refreshToken.recruiterAccount.status !== AccountStatus.ACTIVE ||
      !refreshToken.recruiterAccount.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Refresh token khong hop le hoac da het han');
    }

    // Verify the presented secret before trusting this token id (prevents a
    // guessed id from triggering a family revocation as a denial-of-service).
    await this.verifyRefreshTokenSecret(secret, refreshToken.tokenHash);

    if (refreshToken.revokedAt) {
      // A previously rotated/revoked token is being replayed with a valid secret.
      // Treat this as token theft and revoke every outstanding token for the
      // account, forcing a fresh re-authentication.
      await this.prisma.recruiterRefreshToken.updateMany({
        where: { recruiterAccountId: refreshToken.recruiterAccount.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token khong hop le hoac da het han');
    }

    const newRefreshToken = await this.rotateRefreshToken(
      refreshToken.id,
      refreshToken.recruiterAccount.id,
    );

    const accessToken = await this.authService.signAccessToken({
      id: refreshToken.recruiterAccount.id,
      email: refreshToken.recruiterAccount.email,
      role: ActorType.RECRUITER,
      companyId: refreshToken.recruiterAccount.companyId,
      recruiterRoleId: refreshToken.recruiterAccount.recruiterRoleId,
    });

    return {
      ...accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(dto: RecruiterRefreshTokenDto): Promise<{ message: string }> {
    const { id, secret } = this.parseRefreshToken(dto.refreshToken);
    const refreshToken = await this.prisma.recruiterRefreshToken.findUnique({
      where: { id },
      select: { id: true, tokenHash: true, revokedAt: true },
    });

    if (refreshToken && !refreshToken.revokedAt) {
      await this.verifyRefreshTokenSecret(secret, refreshToken.tokenHash);
      await this.prisma.recruiterRefreshToken.update({
        where: { id: refreshToken.id },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Dang xuat thanh cong.' };
  }

  async requestEmailVerification(
    recruiterAccountId: string,
  ): Promise<RecruiterEmailVerificationRequest> {
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterAccountId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        profile: {
          select: { fullName: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản nhà tuyển dụng');
    }

    const verificationToken = await this.authService.signEmailVerificationToken({
      id: account.id,
      email: account.email,
      role: ActorType.RECRUITER,
    });
    const verificationLink = this.buildEmailVerificationLink(verificationToken);

    if (!account.emailVerifiedAt) {
      await this.emailService.sendRecruiterEmailVerification({
        to: account.email,
        recruiterName: account.profile?.fullName,
        verificationLink,
      });
    }

    return {
      email: account.email,
      emailVerified: Boolean(account.emailVerifiedAt),
      emailVerifiedAt: account.emailVerifiedAt,
      message: account.emailVerifiedAt
        ? 'Email của bạn đã được xác thực.'
        : 'Hệ thống đã gửi link xác thực đến email của bạn.',
    };
  }

  async requestEmailVerificationByEmail(email: string): Promise<RecruiterEmailVerificationRequest> {
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        profile: {
          select: { fullName: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản nhà tuyển dụng với email này');
    }

    const verificationToken = await this.authService.signEmailVerificationToken({
      id: account.id,
      email: account.email,
      role: ActorType.RECRUITER,
    });
    const verificationLink = this.buildEmailVerificationLink(verificationToken);

    if (!account.emailVerifiedAt) {
      await this.emailService.sendRecruiterEmailVerification({
        to: account.email,
        recruiterName: account.profile?.fullName,
        verificationLink,
      });
    }

    return {
      email: account.email,
      emailVerified: Boolean(account.emailVerifiedAt),
      emailVerifiedAt: account.emailVerifiedAt,
      message: account.emailVerifiedAt
        ? 'Email của bạn đã được xác thực.'
        : 'Hệ thống đã gửi link xác thực đến email của bạn.',
    };
  }

  async getEmailVerificationStatusByEmail(
    email: string,
  ): Promise<RecruiterEmailVerificationRequest> {
    const normalizedEmail = email.toLowerCase();
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { email: normalizedEmail },
      select: {
        email: true,
        emailVerifiedAt: true,
      },
    });

    // Do not disclose whether an arbitrary address has an account. The
    // registration page only needs to know whether it can proceed.
    if (!account) {
      return {
        email: normalizedEmail,
        emailVerified: false,
        emailVerifiedAt: null,
        message: 'ÄÃ£ kiá»ƒm tra tráº¡ng thÃ¡i xÃ¡c thá»±c email.',
      };
    }

    return {
      email: normalizedEmail,
      emailVerified: Boolean(account.emailVerifiedAt),
      emailVerifiedAt: account.emailVerifiedAt,
      message: 'ÄÃ£ kiá»ƒm tra tráº¡ng thÃ¡i xÃ¡c thá»±c email.',
    };
  }

  async verifyEmail(dto: VerifyRecruiterEmailDto): Promise<RecruiterEmailVerificationResult> {
    const payload = await this.authService.verifyEmailVerificationToken(dto.token);

    const account = await this.prisma.recruiterAccount.findFirst({
      where: {
        id: payload.sub,
        email: payload.email,
        status: AccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('Token xác thực email không hợp lệ');
    }

    const verifiedAccount = account.emailVerifiedAt
      ? account
      : await this.prisma.recruiterAccount.update({
          where: { id: account.id },
          data: { emailVerifiedAt: new Date() },
          select: {
            email: true,
            emailVerifiedAt: true,
          },
        });

    return {
      email: verifiedAccount.email,
      emailVerified: true,
      emailVerifiedAt: verifiedAccount.emailVerifiedAt as Date,
    };
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    locale?: string,
  ): Promise<PasswordResetRequestResponse> {
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
        resetLink: this.buildPasswordResetLink('recruiter', token, locale),
        actor: 'recruiter',
        locale,
      });
    }

    return {
      message: 'Hệ thống đã gửi link đặt lại mật khẩu đến email của bạn.',
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

  private buildPasswordResetLink(actor: 'recruiter', token: string, locale?: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const lang = locale === 'en' ? 'en' : 'vi';
    const url = new URL(`/${lang}/${actor}/reset-password`, frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private buildEmailVerificationLink(token: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const url = new URL('/vi/recruiter/email-verification', frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  async loginOrRegisterGoogle(googleUser: {
    providerUserId: string;
    email: string;
    fullName: string;
  }): Promise<RecruiterLoginResponse> {
    const { providerUserId, email, fullName } = googleUser;

    if (!email) {
      throw new UnauthorizedException('Không thể lấy email từ tài khoản Google.');
    }

    let account = await this.prisma.recruiterAccount.findFirst({
      where: {
        authProvider: AuthProvider.GOOGLE,
        providerUserId: providerUserId,
      },
    });

    if (!account) {
      account = await this.prisma.recruiterAccount.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (account) {
        account = await this.prisma.recruiterAccount.update({
          where: { id: account.id },
          data: {
            authProvider: AuthProvider.GOOGLE,
            providerUserId: providerUserId,
            emailVerifiedAt: account.emailVerifiedAt || new Date(),
          },
        });
      } else {
        account = await this.prisma.recruiterAccount.create({
          data: {
            email: email.toLowerCase(),
            authProvider: AuthProvider.GOOGLE,
            providerUserId: providerUserId,
            status: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            profile: {
              create: {
                fullName: fullName || 'Google User',
              },
            },
          },
        });
      }
    }

    if (account.status === AccountStatus.BANNED) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa.');
    }

    return this.issueRecruiterTokens(account);
  }

  private async issueRecruiterTokens(
    account: RecruiterTokenAccount,
  ): Promise<RecruiterLoginResponse> {
    const accessToken = await this.authService.signAccessToken({
      id: account.id,
      email: account.email,
      role: ActorType.RECRUITER,
      companyId: account.companyId,
      recruiterRoleId: account.recruiterRoleId,
    });

    return {
      ...accessToken,
      refreshToken: await this.createRefreshToken(account.id),
    };
  }

  private async createRefreshToken(recruiterAccountId: string): Promise<string> {
    const secret = randomBytes(64).toString('base64url');
    const refreshToken = await this.prisma.recruiterRefreshToken.create({
      data: {
        recruiterAccountId,
        tokenHash: await this.authService.hashPassword(secret),
        expiresAt: this.getRefreshTokenExpiresAt(),
      },
      select: { id: true },
    });

    return `${refreshToken.id}.${secret}`;
  }

  private async rotateRefreshToken(
    refreshTokenId: string,
    recruiterAccountId: string,
  ): Promise<string> {
    const secret = randomBytes(64).toString('base64url');
    const tokenHash = await this.authService.hashPassword(secret);
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const revokeResult = await tx.recruiterRefreshToken.updateMany({
        where: { id: refreshTokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revokeResult.count !== 1) {
        throw new UnauthorizedException('Refresh token khong hop le hoac da het han');
      }

      return tx.recruiterRefreshToken.create({
        data: {
          recruiterAccountId,
          tokenHash,
          expiresAt: this.getRefreshTokenExpiresAt(),
        },
        select: { id: true },
      });
    });

    return `${refreshToken.id}.${secret}`;
  }

  private parseRefreshToken(refreshToken: string) {
    const separatorIndex = refreshToken.indexOf('.');

    if (separatorIndex <= 0 || separatorIndex === refreshToken.length - 1) {
      throw new UnauthorizedException('Refresh token khong hop le hoac da het han');
    }

    return {
      id: refreshToken.slice(0, separatorIndex),
      secret: refreshToken.slice(separatorIndex + 1),
    };
  }

  private async verifyRefreshTokenSecret(secret: string, tokenHash: string) {
    try {
      await this.authService.verifyPassword(secret, tokenHash);
    } catch {
      throw new UnauthorizedException('Refresh token khong hop le hoac da het han');
    }
  }

  private getRefreshTokenExpiresAt() {
    const expiresIn = this.configService.get<string>('jwtRefreshExpiresIn') ?? '30d';
    return new Date(Date.now() + this.parseDurationToMs(expiresIn));
  }

  private parseDurationToMs(duration: string) {
    const match = duration.trim().match(/^(\d+)\s*([smhd])$/i);

    if (!match) {
      throw new Error('JWT_REFRESH_EXPIRES_IN must use s, m, h, or d suffix');
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
  }
}
