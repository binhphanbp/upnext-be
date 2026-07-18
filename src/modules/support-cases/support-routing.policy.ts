import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  CompanyStatus,
  CompanyVerificationStatus,
  ModerationStatus,
  SupportDepartment,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export const supportCategoryDepartment = {
  PLAN_CONSULTING: SupportDepartment.SALES,
  PLAN_UPGRADE: SupportDepartment.SALES,
  INVOICE: SupportDepartment.BILLING,
  PAYMENT: SupportDepartment.BILLING,
  JOB_REVIEW: SupportDepartment.JOB_REVIEW,
  COMPANY_VERIFICATION: SupportDepartment.COMPANY_VERIFICATION,
  TECHNICAL: SupportDepartment.TECHNICAL,
  GENERAL: SupportDepartment.GENERAL,
} as const;

export type SupportCategoryCode = keyof typeof supportCategoryDepartment;

type SupportContext = {
  jobPostId?: string;
  invoiceId?: string;
  companySubscriptionId?: string;
};

@Injectable()
export class SupportRoutingPolicy {
  constructor(private readonly prisma: PrismaService) {}

  departmentFor(category: string): SupportDepartment {
    const department = supportCategoryDepartment[category as SupportCategoryCode];
    if (!department) throw new BadRequestException('Unsupported support category');
    return department;
  }

  permissionFor(department: SupportDepartment) {
    return `support:${department.toLowerCase()}:handle`;
  }

  assertAdminAccess(user: AuthenticatedUser, department: SupportDepartment, action?: string) {
    if (user.role !== ActorType.ADMIN) throw new ForbiddenException('Admin access required');
    const canHandle =
      user.permissions.includes(this.permissionFor(department)) ||
      user.permissions.includes('support:view_all');
    if (!canHandle || (action && !user.permissions.includes(action))) {
      throw new ForbiddenException('Support permission required');
    }
  }

  async validateContext(companyId: string, department: SupportDepartment, context: SupportContext) {
    if (department === SupportDepartment.JOB_REVIEW) {
      if (!context.jobPostId) throw new BadRequestException('jobPostId is required');
      const job = await this.prisma.jobPost.findFirst({
        where: {
          id: context.jobPostId,
          companyId,
          deletedAt: null,
          moderationStatus: { in: [ModerationStatus.PENDING, ModerationStatus.REJECTED] },
        },
        select: { id: true },
      });
      if (!job) throw new NotFoundException('Eligible job post not found');
    }

    if (department === SupportDepartment.BILLING) {
      if (!context.invoiceId) throw new BadRequestException('invoiceId is required');
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: context.invoiceId, companyId },
        select: { id: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (context.companySubscriptionId) {
        const subscription = await this.prisma.companySubscription.findFirst({
          where: { id: context.companySubscriptionId, companyId },
          select: { id: true },
        });
        if (!subscription) throw new NotFoundException('Company subscription not found');
      }
    }

    if (department === SupportDepartment.COMPANY_VERIFICATION) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          OR: [
            {
              verificationStatus: {
                in: [CompanyVerificationStatus.PENDING, CompanyVerificationStatus.REJECTED],
              },
            },
            { status: CompanyStatus.LOCKED },
          ],
        },
        select: { id: true },
      });
      if (!company)
        throw new BadRequestException('Company is not eligible for verification support');
    }
  }
}
