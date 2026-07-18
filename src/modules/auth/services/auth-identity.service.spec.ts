import { UnauthorizedException } from '@nestjs/common';
import { AccountStatus, ActorType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthIdentityService } from './auth-identity.service';

describe('AuthIdentityService', () => {
  const prisma = {
    candidateAccount: { findFirst: jest.fn() },
    recruiterAccount: { findFirst: jest.fn() },
    adminUser: { findFirst: jest.fn() },
  };
  const service = new AuthIdentityService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('uses current recruiter company, role and permissions instead of stale JWT scope', async () => {
    prisma.recruiterAccount.findFirst.mockResolvedValue({
      id: 'recruiter-id',
      email: 'recruiter@upnext.dev',
      companyId: 'current-company',
      recruiterRoleId: 'current-role',
      recruiterRole: {
        rolePermissions: [{ recruiterPermission: { code: 'applications:review_assigned' } }],
      },
    });

    await expect(
      service.resolveJwtPayload({
        sub: 'recruiter-id',
        email: 'recruiter@upnext.dev',
        role: ActorType.RECRUITER,
        companyId: 'stale-company',
        recruiterRoleId: 'stale-role',
      }),
    ).resolves.toMatchObject({
      companyId: 'current-company',
      recruiterRoleId: 'current-role',
      permissions: ['applications:review_assigned'],
    });
    expect(prisma.recruiterAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AccountStatus.ACTIVE }),
      }),
    );
  });

  it('rejects a token after the account is no longer active', async () => {
    prisma.candidateAccount.findFirst.mockResolvedValue(null);
    await expect(
      service.resolveJwtPayload({
        sub: 'candidate-id',
        email: 'candidate@upnext.dev',
        role: ActorType.CANDIDATE,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
