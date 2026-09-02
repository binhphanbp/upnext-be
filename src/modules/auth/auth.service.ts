import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ActorType } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { LoginResponse } from './entities/auth.entity';
import {
  EmailVerificationTokenPayload,
  JwtPayload,
  PasswordResetTokenPayload,
  RecruiterMagicLinkTokenPayload,
} from './auth.types';

/**
 * Link trong email đăng nhập được luôn, nên hạn phải ngắn: nó nằm trong hộp thư và ai
 * đọc được hộp thư đó là vào được tài khoản. 30 phút đủ cho người nhận bấm vào,
 * và ngắn hơn 48 lần so với token xác thực email (24h).
 */
const MAGIC_LINK_TTL = '30m';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async hashPassword(password: string) {
    return hash(password, 10);
  }

  async verifyPassword(password: string, passwordHash?: string | null) {
    if (!passwordHash) {
      throw new UnauthorizedException('Sai thông tin đăng nhập');
    }

    const isPasswordValid = await compare(password, passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Sai thông tin đăng nhập');
    }
  }

  async signAccessToken(user: {
    id: string;
    email: string;
    role: ActorType;
    companyId?: string | null;
    recruiterRoleId?: string | null;
    adminRoleId?: string | null;
    tokenVersion?: number;
  }): Promise<LoginResponse> {
    const { id, role, ...payloadData } = user;
    const payload: JwtPayload = {
      sub: id,
      role,
      ...payloadData,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: {
        id,
        email: user.email,
        role,
      },
    };
  }

  /**
   * Token cho link "đăng nhập luôn" trong email gửi nhà tuyển dụng.
   *
   * Cố ý không đánh dấu dùng-một-lần: người nhận hay bấm lại link (mở trên điện thoại
   * rồi mở trên máy), single-use sẽ làm lần thứ hai báo lỗi. Đánh đổi là token replay
   * được trong 30 phút — chấp nhận được vì chính email chứa nó cũng đọc được suốt
   * khoảng đó, và đây đã chặt hơn token xác thực email sẵn có trong repo.
   */
  async signRecruiterMagicLinkToken(user: { id: string; email: string }) {
    const payload: RecruiterMagicLinkTokenPayload = {
      sub: user.id,
      email: user.email,
      role: ActorType.RECRUITER,
      purpose: 'recruiter-magic-link',
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: MAGIC_LINK_TTL as JwtSignOptions['expiresIn'],
    });
  }

  async verifyRecruiterMagicLinkToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RecruiterMagicLinkTokenPayload>(token);

      // `purpose` là thứ chặn việc mang access token thường (hoặc token xác thực email)
      // sang dùng ở đây để đổi lấy session.
      if (payload.role !== ActorType.RECRUITER || payload.purpose !== 'recruiter-magic-link') {
        throw new UnauthorizedException('Link đăng nhập không hợp lệ.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Link đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
  }

  async signEmailVerificationToken(user: { id: string; email: string; role: ActorType }) {
    const payload: EmailVerificationTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      purpose: 'email-verification',
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: '24h' as JwtSignOptions['expiresIn'],
    });
  }

  async verifyEmailVerificationToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<EmailVerificationTokenPayload>(token);

      if (
        (payload.role !== ActorType.CANDIDATE && payload.role !== ActorType.RECRUITER) ||
        payload.purpose !== 'email-verification'
      ) {
        throw new UnauthorizedException('Token xác thực email không hợp lệ');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Token xác thực email không hợp lệ hoặc đã hết hạn');
    }
  }

  async signPasswordResetToken(user: { id: string; email: string; role: ActorType }) {
    const payload: PasswordResetTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      purpose: 'password-reset',
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: '15m' as JwtSignOptions['expiresIn'],
    });
  }

  async verifyPasswordResetToken(token: string, expectedRole: ActorType) {
    try {
      const payload = await this.jwtService.verifyAsync<PasswordResetTokenPayload>(token);

      if (payload.role !== expectedRole || payload.purpose !== 'password-reset') {
        throw new UnauthorizedException('Token đặt lại mật khẩu không hợp lệ');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }
  }
}
