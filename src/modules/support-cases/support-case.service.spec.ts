import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  CompanyStatus,
  CompanyVerificationStatus,
  ModerationStatus,
  SupportDepartment,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationRealtimeService } from '../conversations/services/conversation-realtime.service';
import { MessageService } from '../conversations/services/message.service';
import { OutboxService } from '../outbox/outbox.service';
import { SupportCaseService } from './support-case.service';
import { SupportRoutingPolicy } from './support-routing.policy';

describe('SupportCaseService', () => {
  const jobPostFindMany = jest.fn();
  const invoiceFindMany = jest.fn();
  const companyFindUniqueOrThrow = jest.fn();
  const supportCaseFindUnique = jest.fn();
  const adminUserFindMany = jest.fn();
  const routing = {
    permissionFor: jest.fn(
      (department: SupportDepartment) => `support:${department.toLowerCase()}:handle`,
    ),
    assertAdminAccess: jest.fn(),
  };
  const service = new SupportCaseService(
    {
      jobPost: { findMany: jobPostFindMany },
      invoice: { findMany: invoiceFindMany },
      company: { findUniqueOrThrow: companyFindUniqueOrThrow },
      supportCase: { findUnique: supportCaseFindUnique },
      adminUser: { findMany: adminUserFindMany },
    } as unknown as PrismaService,
    routing as unknown as SupportRoutingPolicy,
    {} as MessageService,
    {} as OutboxService,
    {} as ConversationRealtimeService,
    { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
  );

  beforeEach(() => {
    jobPostFindMany.mockReset();
    invoiceFindMany.mockReset();
    companyFindUniqueOrThrow.mockReset();
    supportCaseFindUnique.mockReset();
    adminUserFindMany.mockReset();
    routing.assertAdminAccess.mockReset();
  });

  it('lists only non-deleted pending or rejected job posts from the recruiter company', async () => {
    const jobs = [
      {
        id: 'job-id',
        title: 'Backend Developer',
        moderationStatus: ModerationStatus.PENDING,
      },
    ];
    jobPostFindMany.mockResolvedValue(jobs);

    await expect(
      service.listEligibleJobPosts({
        id: 'recruiter-id',
        email: 'recruiter@upnext.dev',
        role: ActorType.RECRUITER,
        companyId: 'company-id',
        permissions: [],
      }),
    ).resolves.toEqual({ data: jobs });
    expect(jobPostFindMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-id',
        deletedAt: null,
        moderationStatus: {
          in: [ModerationStatus.PENDING, ModerationStatus.REJECTED],
        },
      },
      select: {
        id: true,
        title: true,
        moderationStatus: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects users without recruiter company access', async () => {
    await expect(
      service.listEligibleJobPosts({
        id: 'admin-id',
        email: 'admin@upnext.dev',
        role: ActorType.ADMIN,
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(jobPostFindMany).not.toHaveBeenCalled();
  });

  it('returns company-scoped creation options and computes verification eligibility', async () => {
    const jobPosts = [
      { id: 'job-id', title: 'Backend Developer', moderationStatus: ModerationStatus.REJECTED },
    ];
    const invoices = [
      {
        id: 'invoice-id',
        invoiceCode: 'INV-001',
        amount: '1000000',
        paymentStatus: 'PENDING',
        createdAt: new Date('2026-07-18T00:00:00.000Z'),
      },
    ];
    jobPostFindMany.mockResolvedValue(jobPosts);
    invoiceFindMany.mockResolvedValue(invoices);
    companyFindUniqueOrThrow.mockResolvedValue({
      id: 'company-id',
      name: 'UpNext Company',
      status: CompanyStatus.ACTIVE,
      verificationStatus: CompanyVerificationStatus.PENDING,
    });

    const result = await service.listCreationOptions(recruiter());

    expect(result.data.jobPosts).toEqual(jobPosts);
    expect(result.data.invoices).toEqual(invoices);
    expect(result.data.company.eligibleForVerificationSupport).toBe(true);
    expect(invoiceFindMany).toHaveBeenCalledWith({
      where: { companyId: 'company-id' },
      select: {
        id: true,
        invoiceCode: true,
        amount: true,
        paymentStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists only active admins who can handle the support department', async () => {
    supportCaseFindUnique.mockResolvedValue({
      id: 'case-id',
      department: SupportDepartment.JOB_REVIEW,
      assignedAdminUserId: 'current-admin',
    });
    const admins = [
      {
        id: 'next-admin',
        fullName: 'Next Admin',
        email: 'next@upnext.dev',
        role: { roleName: 'Job Review' },
      },
    ];
    adminUserFindMany.mockResolvedValue(admins);

    await expect(
      service.listEligibleAssignees('case-id', {
        id: 'current-admin',
        email: 'current@upnext.dev',
        role: ActorType.ADMIN,
        permissions: ['support:job_review:handle', 'support:transfer'],
      }),
    ).resolves.toEqual({ data: admins });
    expect(adminUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'current-admin' },
          role: expect.objectContaining({
            rolePermissions: {
              some: {
                permission: {
                  permissionCode: {
                    in: ['support:job_review:handle', 'support:view_all'],
                  },
                },
              },
            },
          }),
        }),
      }),
    );
  });
});

function recruiter() {
  return {
    id: 'recruiter-id',
    email: 'recruiter@upnext.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: [],
  };
}
