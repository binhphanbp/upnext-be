import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, ActorType, AuthProvider, Prisma } from '@prisma/client';
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
import { RegisterCandidateDto } from './dto/register-candidate.dto';
import { VerifyCandidateEmailDto } from './dto/verify-candidate-email.dto';
import {
  CandidateEmailVerificationRequest,
  CandidateEmailVerificationResult,
} from './entities/email-verification.entity';

@Injectable()
export class CandidateAccountAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterCandidateDto): Promise<LoginResponse> {
    try {
      const account = await this.prisma.candidateAccount.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash: await this.authService.hashPassword(dto.password),
          authProvider: AuthProvider.DEFAULT,
          candidateAccountStatus: AccountStatus.ACTIVE,
          profile: {
            create: {},
          },
        },
        select: { id: true, email: true },
      });

      return this.authService.signAccessToken({
        id: account.id,
        email: account.email,
        role: ActorType.CANDIDATE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tài khoản ứng viên đã tồn tại');
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const account = await this.prisma.candidateAccount.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        candidateAccountStatus: AccountStatus.ACTIVE,
      },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!account) {
      throw new UnauthorizedException('Sai thông tin đăng nhập');
    }

    await this.authService.verifyPassword(dto.password, account.passwordHash);

    return this.authService.signAccessToken({
      id: account.id,
      email: account.email,
      role: ActorType.CANDIDATE,
    });
  }

  async requestEmailVerification(
    candidateAccountId: string,
  ): Promise<CandidateEmailVerificationRequest> {
    const account = await this.prisma.candidateAccount.findUnique({
      where: { id: candidateAccountId },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản ứng viên');
    }

    const verificationToken = await this.authService.signEmailVerificationToken({
      id: account.id,
      email: account.email,
      role: ActorType.CANDIDATE,
    });
    const verificationLink = this.buildEmailVerificationLink(verificationToken);

    if (!account.emailVerifiedAt) {
      await this.emailService.sendCandidateEmailVerification({
        to: account.email,
        candidateName: account.fullName,
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

  async verifyEmail(dto: VerifyCandidateEmailDto): Promise<CandidateEmailVerificationResult> {
    const payload = await this.authService.verifyEmailVerificationToken(dto.token);

    const account = await this.prisma.candidateAccount.findFirst({
      where: {
        id: payload.sub,
        email: payload.email,
        candidateAccountStatus: AccountStatus.ACTIVE,
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
      : await this.prisma.candidateAccount.update({
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
    const account = await this.prisma.candidateAccount.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        candidateAccountStatus: AccountStatus.ACTIVE,
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
        role: ActorType.CANDIDATE,
      });

      await this.emailService.sendPasswordReset({
        to: account.email,
        resetLink: this.buildPasswordResetLink('candidate', token, locale),
        actor: 'candidate',
        locale,
      });
    }

    return {
      message: 'Nếu email tồn tại, hệ thống đã gửi link đặt lại mật khẩu đến email của bạn.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<PasswordResetResponse> {
    const payload = await this.authService.verifyPasswordResetToken(dto.token, ActorType.CANDIDATE);

    const account = await this.prisma.candidateAccount.findFirst({
      where: {
        id: payload.sub,
        email: payload.email,
        candidateAccountStatus: AccountStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!account) {
      throw new UnauthorizedException('Token đặt lại mật khẩu không hợp lệ');
    }

    await this.prisma.candidateAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: await this.authService.hashPassword(dto.password),
      },
    });

    return { message: 'Đặt lại mật khẩu thành công.' };
  }

  private buildEmailVerificationLink(token: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const url = new URL('/candidate/verify-email', frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private buildPasswordResetLink(actor: 'candidate', token: string, locale?: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const lang = locale === 'en' ? 'en' : 'vi';
    const url = new URL(`/${lang}/${actor}/reset-password`, frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }
  async loginOrRegisterGoogle(googleUser: {
    providerUserId: string;
    email: string;
    fullName: string;
  }): Promise<LoginResponse> {
    const { providerUserId, email, fullName } = googleUser;

    if (!email) {
      throw new UnauthorizedException('Không thể lấy email từ tài khoản Google.');
    }
    let account = await this.prisma.candidateAccount.findFirst({
      where: {
        authProvider: AuthProvider.GOOGLE,
        providerUserId: providerUserId,
      },
    });

    if (!account) {
      account = await this.prisma.candidateAccount.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (account) {
        account = await this.prisma.candidateAccount.update({
          where: { id: account.id },
          data: {
            authProvider: AuthProvider.GOOGLE,
            providerUserId: providerUserId,
            emailVerifiedAt: account.emailVerifiedAt || new Date(),
          },
        });
      } else {
        account = await this.prisma.candidateAccount.create({
          data: {
            fullName: fullName || 'Google User',
            email: email.toLowerCase(),
            authProvider: AuthProvider.GOOGLE,
            providerUserId: providerUserId,
            candidateAccountStatus: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            profile: {
              create: {},
            },
          },
        });
      }
    }
    if (account.candidateAccountStatus === AccountStatus.BANNED) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa.');
    }
    return this.authService.signAccessToken({
      id: account.id,
      email: account.email,
      role: ActorType.CANDIDATE,
    });
  }
}
