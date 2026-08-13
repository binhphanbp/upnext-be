import { ConfigService } from '@nestjs/config';
import { AccountStatus, ActorType } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CandidateAccountAuthService } from './candidate-account-auth.service';

describe('CandidateAccountAuthService password reset', () => {
  const prisma = {
    candidateAccount: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const authService = {
    hashPassword: jest.fn(),
    signPasswordResetToken: jest.fn(),
    verifyPasswordResetToken: jest.fn(),
  };
  const emailService = {
    sendPasswordReset: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('https://app.upnext.test'),
  };
  const service = new CandidateAccountAuthService(
    prisma as unknown as PrismaService,
    authService as unknown as AuthService,
    emailService as unknown as EmailService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue('https://app.upnext.test');
  });

  it('sends a locale-aware reset link only for an active candidate account', async () => {
    prisma.candidateAccount.findFirst.mockResolvedValue({
      id: 'candidate-id',
      email: 'candidate@example.com',
    });
    authService.signPasswordResetToken.mockResolvedValue('reset-token');

    await service.requestPasswordReset({ email: 'CANDIDATE@example.com' }, 'en');

    expect(prisma.candidateAccount.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'candidate@example.com',
        candidateAccountStatus: AccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
      },
    });
    expect(authService.signPasswordResetToken).toHaveBeenCalledWith({
      id: 'candidate-id',
      email: 'candidate@example.com',
      role: ActorType.CANDIDATE,
    });
    expect(emailService.sendPasswordReset).toHaveBeenCalledWith({
      to: 'candidate@example.com',
      resetLink: 'https://app.upnext.test/en/candidate/reset-password?token=reset-token',
      actor: 'candidate',
      locale: 'en',
    });
  });

  it('keeps the request response generic when the candidate account is absent', async () => {
    prisma.candidateAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset({ email: 'unknown@example.com' }, 'vi'),
    ).resolves.toEqual({
      message: expect.any(String),
    });
    expect(authService.signPasswordResetToken).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('updates the password only after a candidate-scoped reset token is verified', async () => {
    authService.verifyPasswordResetToken.mockResolvedValue({
      sub: 'candidate-id',
      email: 'candidate@example.com',
    });
    prisma.candidateAccount.findFirst.mockResolvedValue({ id: 'candidate-id' });
    authService.hashPassword.mockResolvedValue('new-password-hash');
    prisma.candidateAccount.update.mockResolvedValue({ id: 'candidate-id' });

    await service.resetPassword({ token: 'reset-token', password: 'new-password' });

    expect(authService.verifyPasswordResetToken).toHaveBeenCalledWith(
      'reset-token',
      ActorType.CANDIDATE,
    );
    expect(prisma.candidateAccount.update).toHaveBeenCalledWith({
      where: { id: 'candidate-id' },
      data: { passwordHash: 'new-password-hash' },
    });
  });
});
