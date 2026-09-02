import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [AuthService],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  describe('recruiter magic link token', () => {
    it('round-trips the account it was issued for', async () => {
      const token = await service.signRecruiterMagicLinkToken({
        id: 'recruiter-id',
        email: 'ntd@company.com',
      });

      const payload = await service.verifyRecruiterMagicLinkToken(token);

      expect(payload.sub).toBe('recruiter-id');
      expect(payload.email).toBe('ntd@company.com');
      expect(payload.role).toBe(ActorType.RECRUITER);
    });

    it('expires in well under an hour', async () => {
      const token = await service.signRecruiterMagicLinkToken({
        id: 'recruiter-id',
        email: 'ntd@company.com',
      });

      // Token này cấp session ngay nên hạn phải ngắn — không được nhận giá trị dài như
      // token xác thực email (24h).
      const decoded = jwtService.decode<{ exp: number; iat: number }>(token);
      const lifetimeMinutes = (decoded.exp - decoded.iat) / 60;

      expect(lifetimeMinutes).toBeLessThanOrEqual(30);
    });

    it('refuses a token minted for a different purpose', async () => {
      // Chặn việc mang token xác thực email sang đổi lấy session đăng nhập.
      const emailToken = await service.signEmailVerificationToken({
        id: 'recruiter-id',
        email: 'ntd@company.com',
        role: ActorType.RECRUITER,
      });

      await expect(service.verifyRecruiterMagicLinkToken(emailToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a magic link token carrying a non-recruiter role', async () => {
      const forged = await jwtService.signAsync({
        sub: 'candidate-id',
        email: 'ung.vien@gmail.com',
        role: ActorType.CANDIDATE,
        purpose: 'recruiter-magic-link',
      });

      await expect(service.verifyRecruiterMagicLinkToken(forged)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses an expired token', async () => {
      const expired = await jwtService.signAsync(
        {
          sub: 'recruiter-id',
          email: 'ntd@company.com',
          role: ActorType.RECRUITER,
          purpose: 'recruiter-magic-link',
        },
        { expiresIn: '-1s' },
      );

      await expect(service.verifyRecruiterMagicLinkToken(expired)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a token signed with another secret', async () => {
      const otherIssuer = new JwtService({ secret: 'not-our-secret' });
      const forged = await otherIssuer.signAsync({
        sub: 'recruiter-id',
        email: 'ntd@company.com',
        role: ActorType.RECRUITER,
        purpose: 'recruiter-magic-link',
      });

      await expect(service.verifyRecruiterMagicLinkToken(forged)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
