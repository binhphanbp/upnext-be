import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActorType, SupportDepartment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportRoutingPolicy } from './support-routing.policy';

describe('SupportRoutingPolicy', () => {
  const policy = new SupportRoutingPolicy({} as PrismaService);
  const admin = (permissions: string[]) => ({
    id: 'admin-id',
    email: 'admin@upnext.dev',
    role: ActorType.ADMIN,
    permissions,
  });

  it('maps categories to a department deterministically', () => {
    expect(policy.departmentFor('PAYMENT')).toBe(SupportDepartment.BILLING);
    expect(policy.departmentFor('JOB_REVIEW')).toBe(SupportDepartment.JOB_REVIEW);
  });

  it('requires both department and action permissions', () => {
    expect(() =>
      policy.assertAdminAccess(
        admin(['support:billing:handle', 'support:resolve']),
        SupportDepartment.BILLING,
        'support:resolve',
      ),
    ).not.toThrow();
    expect(() =>
      policy.assertAdminAccess(
        admin(['support:billing:handle']),
        SupportDepartment.BILLING,
        'support:resolve',
      ),
    ).toThrow(ForbiddenException);
  });

  it('never grants access based on an admin role name', () => {
    expect(() => policy.assertAdminAccess(admin([]), SupportDepartment.GENERAL)).toThrow(
      ForbiddenException,
    );
  });

  it('requires an invoice for billing support instead of accepting a raw subscription id', async () => {
    await expect(
      policy.validateContext('company-id', SupportDepartment.BILLING, {
        companySubscriptionId: 'subscription-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
