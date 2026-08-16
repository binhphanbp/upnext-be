/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { CompanyMembersService } from './company-members.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../../common/email/email.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { ActorType } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

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
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyMembersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuthService, useValue: authServiceMock },
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
        service.updateMemberRole('target-member-id', { roleId: 'owner-role-id' }, {
          ...currentUser,
          id: 'other-account-id',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
