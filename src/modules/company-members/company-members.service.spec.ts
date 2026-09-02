/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { CompanyMembersService } from './company-members.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../../common/email/email.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { ActorType, CompanyMemberStatus, CompanyVerificationStatus } from '@prisma/client';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';

describe('CompanyMembersService', () => {
  let service: CompanyMembersService;

  const prismaMock: any = {
    company: {
      findUnique: jest.fn(),
    },
    companyMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    recruiterRole: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(prismaMock)),
  };

  const emailServiceMock = {
    sendCompanyInvitation: jest.fn(),
  };

  const configServiceMock = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  const authServiceMock = {
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    signAccessToken: jest.fn().mockReturnValue('token'),
  };

  const quotaMock = {
    getFeatureLimit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyMembersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: SubscriptionQuotaService, useValue: quotaMock },
      ],
    }).compile();

    service = module.get<CompanyMembersService>(CompanyMembersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateMemberRole - Transfer Ownership', () => {
    const currentUser: AuthenticatedUser = {
      id: 'owner-account-id',
      email: 'owner@company.com',
      role: ActorType.RECRUITER,
      companyId: 'company-id',
      permissions: [],
    };

    const targetMember = {
      id: 'target-member-id',
      recruiterAccountId: 'hr-b-account-id',
      companyId: 'company-id',
      roleId: 'hr-role-id',
      role: { id: 'hr-role-id', code: 'HR', name: 'HR' },
    };

    const ownerRole = {
      id: 'owner-role-id',
      code: 'OWNER',
      name: 'Owner',
      companyId: null,
    };

    const hrRole = {
      id: 'hr-role-id',
      code: 'HR',
      name: 'HR',
      companyId: null,
    };

    it('transfers ownership and downgrades old owner to HR', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(targetMember);
      prismaMock.recruiterRole.findUnique.mockResolvedValue(ownerRole);
      prismaMock.companyMember.findFirst.mockResolvedValue({
        id: 'owner-member-id',
        recruiterAccountId: 'owner-account-id',
        companyId: 'company-id',
        role: { id: 'owner-role-id', code: 'OWNER', name: 'Owner' },
      });
      prismaMock.recruiterRole.findFirst.mockResolvedValue(hrRole);

      prismaMock.companyMember.findMany.mockResolvedValue([
        { id: 'owner-member-id', recruiterAccountId: 'owner-account-id' },
      ]);
      prismaMock.companyMember.update.mockResolvedValue({
        ...targetMember,
        roleId: ownerRole.id,
        role: ownerRole,
      });

      const result = await service.updateMemberRole(
        'target-member-id',
        { roleId: 'owner-role-id' },
        currentUser,
      );

      // Verify old owner was downgraded to HR in companyMember
      expect(prismaMock.companyMember.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['owner-member-id'] } },
        data: { roleId: hrRole.id },
      });

      // Verify old owner was downgraded to HR in recruiterAccount
      expect(prismaMock.recruiterAccount.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['owner-account-id'] } },
        data: { recruiterRoleId: hrRole.id },
      });

      // Verify target member was upgraded to OWNER in companyMember
      expect(prismaMock.companyMember.update).toHaveBeenCalledWith({
        where: { id: 'target-member-id' },
        data: { roleId: ownerRole.id },
        include: { role: { select: { id: true, code: true, name: true } } },
      });

      // Verify target member was upgraded to OWNER in recruiterAccount
      expect(prismaMock.recruiterAccount.update).toHaveBeenCalledWith({
        where: { id: 'hr-b-account-id' },
        data: { recruiterRoleId: ownerRole.id },
      });

      expect(result.roleId).toBe(ownerRole.id);
    });

    it('rejects transfer if caller is not the owner', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(targetMember);
      prismaMock.recruiterRole.findUnique.mockResolvedValue(ownerRole);
      prismaMock.companyMember.findFirst.mockResolvedValue({
        id: 'other-member-id',
        recruiterAccountId: 'other-account-id',
        companyId: 'company-id',
        role: { id: 'hr-role-id', code: 'HR', name: 'HR' },
      });

      await expect(
        service.updateMemberRole(
          'target-member-id',
          { roleId: 'owner-role-id' },
          {
            ...currentUser,
            id: 'other-account-id',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('inviteMember - hr_seat quota', () => {
    const currentUser: AuthenticatedUser = {
      id: 'owner-account-id',
      email: 'owner@company.com',
      role: ActorType.RECRUITER,
      companyId: 'company-id',
      permissions: [],
    };

    const invitingMember = {
      id: 'owner-member-id',
      recruiterAccountId: 'owner-account-id',
      companyId: 'company-id',
      role: { id: 'owner-role-id', code: 'OWNER', name: 'Owner' },
    };

    const verifiedCompany = {
      id: 'company-id',
      name: 'Acme',
      taxCode: '123',
      address: 'HN',
      verificationStatus: CompanyVerificationStatus.VERIFIED,
    };

    const hrRole = { id: 'hr-role-id', code: 'HR', companyId: null };

    const dto = { email: 'new-hire@example.com', roleId: 'hr-role-id' };

    function primeHappyPathMocks() {
      prismaMock.companyMember.findFirst
        .mockResolvedValueOnce(invitingMember) // permission check
        .mockResolvedValueOnce(null); // duplicate-invite check
      prismaMock.company.findUnique.mockResolvedValue(verifiedCompany);
      prismaMock.recruiterAccount.findUnique.mockResolvedValue(null);
      prismaMock.recruiterRole.findUnique.mockResolvedValue(hrRole);
      prismaMock.recruiterAccount.create.mockResolvedValue({
        id: 'new-account-id',
        email: dto.email,
        companyId: null,
      });
      prismaMock.companyMember.create.mockResolvedValue({
        id: 'new-member-id',
        invitedEmail: dto.email,
        recruiterAccount: { id: 'new-account-id', email: dto.email },
        role: { id: 'hr-role-id', code: 'HR', name: 'HR' },
      });
    }

    it('rejects the invite once occupied seats reach the plan limit', async () => {
      primeHappyPathMocks();
      quotaMock.getFeatureLimit.mockResolvedValue({ enabled: true, limit: 2 });
      prismaMock.companyMember.count.mockResolvedValue(2);

      await expect(service.inviteMember('company-id', dto, currentUser)).rejects.toMatchObject({
        response: { code: 'QUOTA_EXHAUSTED', feature: SubscriptionFeature.HR_SEAT },
      });
      expect(prismaMock.companyMember.count).toHaveBeenCalledWith({
        where: {
          companyId: 'company-id',
          status: { in: [CompanyMemberStatus.ACTIVE, CompanyMemberStatus.INVITED] },
        },
      });
      expect(prismaMock.companyMember.create).not.toHaveBeenCalled();
    });

    it('allows the invite when occupied seats are under the plan limit', async () => {
      primeHappyPathMocks();
      quotaMock.getFeatureLimit.mockResolvedValue({ enabled: true, limit: 2 });
      prismaMock.companyMember.count.mockResolvedValue(1);

      const result = await service.inviteMember('company-id', dto, currentUser);

      expect(result.id).toBe('new-member-id');
      expect(prismaMock.companyMember.create).toHaveBeenCalledTimes(1);
    });

    it('rejects the invite when the plan does not include hr_seat at all', async () => {
      primeHappyPathMocks();
      quotaMock.getFeatureLimit.mockResolvedValue({ enabled: false, limit: null });

      await expect(service.inviteMember('company-id', dto, currentUser)).rejects.toMatchObject({
        response: { code: 'FEATURE_NOT_IN_PLAN', feature: SubscriptionFeature.HR_SEAT },
      });
      expect(prismaMock.companyMember.create).not.toHaveBeenCalled();
    });
  });
  describe('invitation expiry', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const owner: AuthenticatedUser = {
      id: 'owner-account-id',
      email: 'owner@company.com',
      role: ActorType.RECRUITER,
      companyId: 'company-id',
      permissions: [],
    };

    function invitation(expiresAt: Date | null) {
      return {
        id: 'invitation-id',
        companyId: 'company-id',
        invitedEmail: 'moi@company.com',
        status: CompanyMemberStatus.INVITED,
        invitationExpiresAt: expiresAt,
        recruiterAccountId: 'invited-account-id',
        roleId: 'hr-role-id',
        company: { name: 'Công ty ABC' },
        role: { name: 'HR' },
        recruiterAccount: {
          id: 'invited-account-id',
          email: 'moi@company.com',
          passwordHash: null,
        },
      };
    }

    it('rejects reading an expired invitation with 410, not 404', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(invitation(new Date(Date.now() - DAY)));

      // 410 để client phân biệt được "link có thật nhưng hết hạn" với "link sai".
      await expect(service.getInvitation('invitation-id')).rejects.toThrow(GoneException);
    });

    it('refuses to set a password through an expired invitation', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(invitation(new Date(Date.now() - DAY)));

      // Đây là đường public duy nhất đặt được mật khẩu cho tài khoản NTD.
      await expect(
        service.acceptAndSetPassword('invitation-id', { password: 'Password123!' }),
      ).rejects.toThrow(GoneException);
      expect(prismaMock.recruiterAccount.update).not.toHaveBeenCalled();
    });

    it('refuses to accept an expired invitation from a signed-in recruiter', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(invitation(new Date(Date.now() - DAY)));

      await expect(
        service.acceptInvitation('invitation-id', {
          ...owner,
          id: 'invited-account-id',
          email: 'moi@company.com',
        }),
      ).rejects.toThrow(GoneException);
    });

    it('still honours an invitation created before the expiry column existed', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(invitation(null));

      const result = await service.getInvitation('invitation-id');

      expect(result.id).toBe('invitation-id');
    });

    it('still honours an invitation that has not run out yet', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(invitation(new Date(Date.now() + DAY)));

      await expect(service.getInvitation('invitation-id')).resolves.toBeDefined();
    });
  });

  describe('resendInvitation', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const owner: AuthenticatedUser = {
      id: 'owner-account-id',
      email: 'owner@company.com',
      role: ActorType.RECRUITER,
      companyId: 'company-id',
      permissions: [],
    };

    const expired = {
      id: 'invitation-id',
      companyId: 'company-id',
      invitedEmail: 'moi@company.com',
      status: CompanyMemberStatus.INVITED,
      invitationExpiresAt: new Date(Date.now() - DAY),
      company: { name: 'Công ty ABC' },
      role: { name: 'HR' },
      recruiterAccount: { email: 'moi@company.com' },
    };

    it('renews the deadline and re-sends the email', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(expired);
      prismaMock.companyMember.findFirst.mockResolvedValue({
        id: 'owner-member-id',
        role: { code: 'OWNER' },
      });
      prismaMock.companyMember.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'invitation-id', ...data }),
      );

      const result = await service.resendInvitation('invitation-id', owner);

      // Hạn mới phải ở tương lai, không phải giữ nguyên hạn cũ.
      expect(result.invitationExpiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(emailServiceMock.sendCompanyInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'moi@company.com' }),
      );
    });

    it('lets nobody but OWNER/HR re-issue a password-setting link', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue(expired);
      prismaMock.companyMember.findFirst.mockResolvedValue({
        id: 'member-id',
        role: { code: 'RECRUITER' },
      });

      await expect(service.resendInvitation('invitation-id', owner)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.companyMember.update).not.toHaveBeenCalled();
      expect(emailServiceMock.sendCompanyInvitation).not.toHaveBeenCalled();
    });

    it('refuses to re-send an invitation that was already accepted', async () => {
      prismaMock.companyMember.findUnique.mockResolvedValue({
        ...expired,
        status: CompanyMemberStatus.ACTIVE,
      });

      await expect(service.resendInvitation('invitation-id', owner)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
