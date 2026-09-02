import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { AdminAuditLogService } from '../admin-users/admin-audit-log.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { AdminInvoiceQueryDto } from './dto/admin-invoice-query.dto';
import { ManualConfirmInvoiceDto } from './dto/manual-confirm-invoice.dto';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { RefundInvoiceDto } from './dto/refund-invoice.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType, PaymentMethod, PaymentStatus, Prisma, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: CompanySubscriptionsService,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  private async resolveCompanyId(user: AuthenticatedUser): Promise<string> {
    if (user.companyId) return user.companyId;
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id: user.id },
      select: { companyId: true },
    });
    if (account?.companyId) return account.companyId;
    throw new ForbiddenException('Not associated with a company');
  }

  private async resolveCandidateProfileId(user: AuthenticatedUser): Promise<string> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
      select: { id: true },
    });
    if (profile?.id) return profile.id;
    throw new NotFoundException('Hồ sơ ứng viên không tồn tại');
  }

  async create(user: AuthenticatedUser, dto: CreateInvoiceDto) {
    let targetCompanyId: string | null = null;
    let targetCandidateProfileId: string | null = null;

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.subscriptionPlanId },
      include: { features: true },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Subscription plan is not active');
    }

    if (user.role === ActorType.RECRUITER) {
      if (Number(plan.price) === 0) {
        throw new BadRequestException('Cannot create invoice for a free plan');
      }

      const now = new Date();
      const activeSub = await this.prisma.companySubscription.findFirst({
        where: {
          companyId: targetCompanyId,
          status: SubscriptionStatus.ACTIVE,
          expiredAt: { gt: now },
        },
        include: { plan: true },
        orderBy: { startedAt: 'desc' },
      });

      if (activeSub && Number(activeSub.plan.price) > 0) {
        if (activeSub.planId === plan.id) {
          const RENEWAL_WINDOW_DAYS = 3;
          const msUntilExpiry = activeSub.expiredAt.getTime() - now.getTime();
          const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);

          if (daysUntilExpiry > RENEWAL_WINDOW_DAYS) {
            const formattedDate = activeSub.expiredAt.toLocaleDateString('vi-VN');
            throw new ConflictException({
              code: 'SUBSCRIPTION_ALREADY_ACTIVE',
              message: `Công ty đang sử dụng gói ${activeSub.plan.subscriptionName} (còn hạn đến ngày ${formattedDate}). Bạn chỉ có thể gia hạn khi gói còn dưới ${RENEWAL_WINDOW_DAYS} ngày.`,
            });
          }
        } else {
          throw new ConflictException({
            code: 'SUBSCRIPTION_CHANGE_NOT_SUPPORTED',
            message:
              'Đổi gói giữa chu kỳ hiện chưa được hỗ trợ. Vui lòng chờ hết chu kỳ hiện tại rồi chọn gói mới.',
          });
        }
      }

      // Check for an existing PENDING invoice for this plan created within the last 24h
      const pendingInvoice = await this.prisma.invoice.findFirst({
        where: {
          companyId: targetCompanyId,
          subscriptionPlanId: plan.id,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        include: { subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingInvoice) {
        return pendingInvoice;
      }
    }

    if (user.role === ActorType.ADMIN) {
      if (!dto.companyId && !dto.candidateProfileId) {
        throw new BadRequestException('companyId or candidateProfileId is required for admin');
      }
      targetCompanyId = dto.companyId || null;
      targetCandidateProfileId = dto.candidateProfileId || null;
    } else if (user.role === ActorType.RECRUITER) {
      if (plan.audience !== 'RECRUITER') {
        throw new BadRequestException('Gói này không dành cho Nhà tuyển dụng');
      }
      targetCompanyId = await this.resolveCompanyId(user);
    } else if (user.role === ActorType.CANDIDATE) {
      if (plan.audience !== 'CANDIDATE') {
        throw new BadRequestException('Gói này không dành cho Ứng viên');
      }
      targetCandidateProfileId = await this.resolveCandidateProfileId(user);
    } else {
      throw new ForbiddenException('Bạn không có quyền tạo hóa đơn');
    }

    if (targetCompanyId) {
      const company = await this.prisma.company.findUnique({ where: { id: targetCompanyId } });
      if (!company) throw new NotFoundException('Company not found');
    }

    if (targetCandidateProfileId) {
      const candidate = await this.prisma.candidateProfile.findUnique({
        where: { id: targetCandidateProfileId },
      });
      if (!candidate) throw new NotFoundException('Candidate profile not found');
    }

    // Tái sử dụng hóa đơn đang CHỜ THANH TOÁN thay vì sinh liên tục hóa đơn mới khi bấm nhiều lần
    const existingPending = await this.prisma.invoice.findFirst({
      where: {
        subscriptionPlanId: plan.id,
        ...(targetCompanyId ? { companyId: targetCompanyId } : {}),
        ...(targetCandidateProfileId ? { candidateProfileId: targetCandidateProfileId } : {}),
        paymentStatus: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptionPlan: true,
        company: true,
        candidateProfile: true,
      },
    });

    if (existingPending) {
      return existingPending;
    }

    // Tạo mã hóa đơn độc nhất dạng: INV-YYYYMMDD-RANDOM
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceCode = `INV-${dateStr}-${randomStr}`;

    return this.prisma.invoice.create({
      data: {
        subscriptionPlanId: plan.id,
        companyId: targetCompanyId,
        candidateProfileId: targetCandidateProfileId,
        invoiceCode: invoiceCode,
        amount: plan.price,
        paymentStatus: PaymentStatus.PENDING,
      },
      include: {
        subscriptionPlan: true,
        company: true,
        candidateProfile: true,
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { subscriptionPlan: true, company: true, candidateProfile: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    if (user.role === ActorType.ADMIN) {
      return invoice;
    }

    if (user.role === ActorType.RECRUITER) {
      const userCompanyId = await this.resolveCompanyId(user);
      if (invoice.companyId !== userCompanyId) {
        throw new ForbiddenException('You do not have permission to view this invoice');
      }
      return invoice;
    }

    if (user.role === ActorType.CANDIDATE) {
      const candidateProfileId = await this.resolveCandidateProfileId(user);
      if (invoice.candidateProfileId !== candidateProfileId) {
        throw new ForbiddenException('You do not have permission to view this invoice');
      }
      return invoice;
    }

    throw new ForbiddenException('You do not have permission to view this invoice');
  }

  async findAll(user: AuthenticatedUser) {
    if (user.role === ActorType.ADMIN) {
      return this.prisma.invoice.findMany({
        include: { company: true, candidateProfile: true, subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === ActorType.RECRUITER) {
      const companyId = await this.resolveCompanyId(user);
      return this.prisma.invoice.findMany({
        where: { companyId },
        include: { subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === ActorType.CANDIDATE) {
      const candidateProfileId = await this.resolveCandidateProfileId(user);
      return this.prisma.invoice.findMany({
        where: { candidateProfileId },
        include: { subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    throw new ForbiddenException('Invalid role');
  }

  async pay(id: string, user: AuthenticatedUser, dto: PayInvoiceDto) {
    const invoice = await this.findOne(id, user);

    if (user.role !== ActorType.ADMIN) {
      if (user.role === ActorType.RECRUITER) {
        const userCompanyId = await this.resolveCompanyId(user);
        if (invoice.companyId !== userCompanyId) {
          throw new ForbiddenException('You do not have permission to pay this invoice');
        }
      } else if (user.role === ActorType.CANDIDATE) {
        const candidateProfileId = await this.resolveCandidateProfileId(user);
        if (invoice.candidateProfileId !== candidateProfileId) {
          throw new ForbiddenException('You do not have permission to pay this invoice');
        }
      }

      // SePay is a real, webhook-verified gateway now (see markPaidByWebhook):
      // a user self-attesting "I paid" through this endpoint is not permitted for SEPAY.
      if (dto.paymentMethod === PaymentMethod.SEPAY) {
        throw new ForbiddenException(
          'Vui lòng chuyển khoản qua SePay -- hệ thống sẽ tự động xác nhận khi nhận được tiền',
        );
      }
    }

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This invoice has already been paid');
    }

    return this.confirmPayment(
      invoice.id,
      invoice.companyId,
      invoice.candidateProfileId,
      invoice.subscriptionPlanId,
      {
        paymentMethod: dto.paymentMethod,
        source: 'INVOICE_PAYMENT',
      },
    );
  }

  /**
   * Called by the SePay webhook once it has verified the request (API key
   * match) and parsed the invoice code + amount out of the bank transfer.
   * Deliberately tolerant of retries/replays -- SePay retries a webhook call
   * that doesn't come back 2xx, so every branch here returns a result the
   * caller can turn into a 200 rather than throwing, except for genuinely
   * unexpected errors.
   */
  async markPaidByWebhook(
    invoiceCode: string,
    paymentMethod: PaymentMethod,
    paymentReference: string,
    transferAmount: number,
  ): Promise<{ handled: boolean; reason?: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { invoiceCode } });

    if (!invoice) {
      this.logger.warn(`SePay webhook: no invoice found for code "${invoiceCode}"`);
      return { handled: false, reason: 'invoice_not_found' };
    }

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      this.logger.log(`SePay webhook: invoice ${invoiceCode} already PAID, ignoring replay`);
      return { handled: true, reason: 'already_paid' };
    }

    const expectedAmount = Number(invoice.amount);
    if (transferAmount !== expectedAmount) {
      this.logger.warn(
        `SePay webhook: amount mismatch for invoice ${invoiceCode} (expected ${expectedAmount}, got ${transferAmount})`,
      );
      return { handled: false, reason: 'amount_mismatch' };
    }

    await this.confirmPayment(
      invoice.id,
      invoice.companyId,
      invoice.candidateProfileId,
      invoice.subscriptionPlanId,
      {
        paymentMethod,
        paymentReference,
        source: 'SEPAY_WEBHOOK',
      },
    );
    return { handled: true };
  }

  /**
   * Single place where an invoice actually flips to PAID and the matching
   * subscription gets activated -- used by both the manual `pay()` endpoint
   * and the SePay webhook, so there is exactly one transaction to get right.
   */
  private async confirmPayment(
    invoiceId: string,
    companyId: string | null | undefined,
    candidateProfileId: string | null | undefined,
    subscriptionPlanId: string,
    options: { paymentMethod: PaymentMethod; source: string; paymentReference?: string; adminNote?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: options.paymentMethod,
          paymentReference: options.paymentReference,
          adminNote: options.adminNote,
          paidAt: new Date(),
        },
        include: { subscriptionPlan: true },
      });

      if (companyId) {
        await this.subscriptionService.activatePlanForCompany(
          companyId,
          subscriptionPlanId,
          options.source,
          tx,
        );

        // Hủy các hóa đơn PENDING cũ của công ty này
        if (typeof tx.invoice?.updateMany === 'function') {
          await tx.invoice.updateMany({
            where: {
              id: { not: invoiceId },
              companyId,
              paymentStatus: PaymentStatus.PENDING,
            },
            data: {
              paymentStatus: PaymentStatus.FAILED,
              cancelledAt: new Date(),
              cancelledReason: 'Đã hoàn tất thanh toán hóa đơn khác',
            },
          });
        }
      } else if (candidateProfileId) {
        await this.activatePlanForCandidate(
          candidateProfileId,
          subscriptionPlanId,
          options.source,
          tx,
        );

        // Hủy các hóa đơn PENDING cũ của ứng viên này
        if (typeof tx.invoice?.updateMany === 'function') {
          await tx.invoice.updateMany({
            where: {
              id: { not: invoiceId },
              candidateProfileId,
              paymentStatus: PaymentStatus.PENDING,
            },
            data: {
              paymentStatus: PaymentStatus.FAILED,
              cancelledAt: new Date(),
              cancelledReason: 'Đã hoàn tất thanh toán hóa đơn khác',
            },
          });
        }
      }

      return updatedInvoice;
    });
  }

  async cancelOwnInvoice(id: string, user: AuthenticatedUser) {
    const invoice = await this.findOne(id, user);

    if (invoice.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy hóa đơn đang chờ thanh toán');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        cancelledAt: new Date(),
        cancelledReason: 'Người dùng hủy thanh toán',
      },
    });
  }

  private async activatePlanForCandidate(
    candidateProfileId: string,
    subscriptionPlanId: string,
    source: string,
    tx: Prisma.TransactionClient,
  ) {
    const plan = await tx.subscriptionPlan.findUnique({
      where: { id: subscriptionPlanId },
      include: { features: true },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const now = new Date();
    const durationDays = plan.durationDays || 30;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Set any currently active candidate subscription to INACTIVE
    await tx.candidateSubscription.updateMany({
      where: { candidateProfileId, status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.INACTIVE },
    });

    const subscription = await tx.candidateSubscription.create({
      data: {
        candidateProfileId,
        planId: plan.id,
        startedAt: now,
        expiredAt: expiresAt,
        currentPeriodStart: now,
        currentPeriodEnd: expiresAt,
        source: source || 'SEPAY',
        status: SubscriptionStatus.ACTIVE,
      },
    });

    // Create quota counters
    if (plan.features.length) {
      await tx.candidateSubscriptionQuotaCounter.createMany({
        data: plan.features.map((feature) => ({
          candidateSubscriptionId: subscription.id,
          feature: feature.feature,
          limitValue: feature.limitValue,
          usedValue: 0,
          periodStart: now,
          periodEnd: expiresAt,
        })),
        skipDuplicates: true,
      });
    }

    this.logger.log(
      `Activated CandidateSubscription ${subscription.id} (${plan.code}) for candidateProfile ${candidateProfileId}`,
    );
    return subscription;
  }

  async findAdminInvoices(query: AdminInvoiceQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (query.search?.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { invoiceCode: { contains: searchTerm, mode: 'insensitive' } },
        { paymentReference: { contains: searchTerm, mode: 'insensitive' } },
        { company: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { company: { taxCode: { contains: searchTerm, mode: 'insensitive' } } },
        { company: { email: { contains: searchTerm, mode: 'insensitive' } } },
        {
          candidateProfile: {
            account: { email: { contains: searchTerm, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.subscriptionPlanId) {
      where.subscriptionPlanId = query.subscriptionPlanId;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        where.createdAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const [total, items] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              taxCode: true,
              address: true,
              email: true,
              phone: true,
              verificationStatus: true,
            },
          },
          candidateProfile: {
            select: {
              id: true,
              phoneNumber: true,
              account: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
          subscriptionPlan: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminInvoiceStats() {
    const [allCounts, paidSum, pendingSum] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['paymentStatus'],
        _count: { id: true },
      }),
      this.prisma.invoice.aggregate({
        where: { paymentStatus: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { paymentStatus: PaymentStatus.PENDING },
        _sum: { amount: true },
      }),
    ]);

    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let refundedCount = 0;
    let totalCount = 0;

    for (const group of allCounts) {
      totalCount += group._count.id;
      if (group.paymentStatus === PaymentStatus.PAID) paidCount = group._count.id;
      else if (group.paymentStatus === PaymentStatus.PENDING) pendingCount = group._count.id;
      else if (group.paymentStatus === PaymentStatus.FAILED) failedCount = group._count.id;
      else if (group.paymentStatus === PaymentStatus.REFUNDED) refundedCount = group._count.id;
    }

    return {
      totalRevenue: paidSum._sum.amount ? Number(paidSum._sum.amount) : 0,
      pendingRevenue: pendingSum._sum.amount ? Number(pendingSum._sum.amount) : 0,
      totalCount,
      paidCount,
      pendingCount,
      failedCount,
      refundedCount,
    };
  }

  async findAdminInvoiceDetail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        candidateProfile: {
          include: { account: true },
        },
        subscriptionPlan: {
          include: { features: true },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    return invoice;
  }

  async manualConfirmInvoice(
    id: string,
    dto: ManualConfirmInvoiceDto,
    admin: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    const invoice = await this.findAdminInvoiceDetail(id);

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Hóa đơn này đã được thanh toán trước đó');
    }
    if (invoice.paymentStatus === PaymentStatus.FAILED) {
      throw new BadRequestException('Hóa đơn đã bị hủy, không thể xác nhận thanh toán');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.SEPAY,
          paymentReference: dto.paymentReference,
          adminNote: dto.adminNote,
          paidAt: new Date(),
        },
        include: { company: true, candidateProfile: true, subscriptionPlan: true },
      });

      if (invoice.companyId) {
        await this.subscriptionService.activatePlanForCompany(
          invoice.companyId,
          invoice.subscriptionPlanId,
          'ADMIN_MANUAL_CONFIRM',
          tx,
        );
      } else if (invoice.candidateProfileId) {
        await this.activatePlanForCandidate(
          invoice.candidateProfileId,
          invoice.subscriptionPlanId,
          'ADMIN_MANUAL_CONFIRM',
          tx,
        );
      }

      await this.auditLogService.log(
        {
          adminId: admin.id,
          action: 'INVOICE_MANUAL_PAID',
          targetId: invoice.id,
          targetType: 'INVOICE',
          ipAddress: ip,
          userAgent: userAgent,
          oldValue: { paymentStatus: invoice.paymentStatus },
          newValue: {
            paymentStatus: PaymentStatus.PAID,
            paymentReference: dto.paymentReference,
            adminNote: dto.adminNote,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async cancelInvoice(
    id: string,
    dto: CancelInvoiceDto,
    admin: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    const invoice = await this.findAdminInvoiceDetail(id);

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException(
        'Không thể hủy hóa đơn đã thanh toán. Vui lòng sử dụng tính năng hoàn tiền.',
      );
    }
    if (invoice.paymentStatus === PaymentStatus.FAILED) {
      throw new BadRequestException('Hóa đơn này đã bị hủy trước đó');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.FAILED,
          cancelledAt: new Date(),
          cancelledReason: dto.reason,
        },
        include: { company: true, candidateProfile: true, subscriptionPlan: true },
      });

      await this.auditLogService.log(
        {
          adminId: admin.id,
          action: 'INVOICE_CANCELLED',
          targetId: invoice.id,
          targetType: 'INVOICE',
          ipAddress: ip,
          userAgent: userAgent,
          oldValue: { paymentStatus: invoice.paymentStatus },
          newValue: { paymentStatus: PaymentStatus.FAILED, reason: dto.reason },
        },
        tx,
      );

      return updated;
    });
  }

  async refundInvoice(
    id: string,
    dto: RefundInvoiceDto,
    admin: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    const invoice = await this.findAdminInvoiceDetail(id);

    if (invoice.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Chỉ có thể hoàn tiền đối với hóa đơn đã thanh toán thành công (PAID)',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          refundedAt: new Date(),
          refundReason: dto.reason,
          refundReference: dto.refundReference,
          adminNote: dto.adminNote
            ? `${invoice.adminNote ? invoice.adminNote + '\n' : ''}[Hoàn tiền]: ${dto.adminNote}`
            : invoice.adminNote,
        },
        include: { company: true, candidateProfile: true, subscriptionPlan: true },
      });

      // Huỷ gói dịch vụ đã kích hoạt từ hoá đơn này nếu đang active gói này
      if (invoice.companyId) {
        await tx.companySubscription.updateMany({
          where: {
            companyId: invoice.companyId,
            planId: invoice.subscriptionPlanId,
            status: SubscriptionStatus.ACTIVE,
          },
          data: {
            status: SubscriptionStatus.CANCELLED,
          },
        });
      } else if (invoice.candidateProfileId) {
        await tx.candidateSubscription.updateMany({
          where: {
            candidateProfileId: invoice.candidateProfileId,
            planId: invoice.subscriptionPlanId,
            status: SubscriptionStatus.ACTIVE,
          },
          data: {
            status: SubscriptionStatus.CANCELLED,
          },
        });
      }

      await this.auditLogService.log(
        {
          adminId: admin.id,
          action: 'INVOICE_REFUNDED',
          targetId: invoice.id,
          targetType: 'INVOICE',
          ipAddress: ip,
          userAgent: userAgent,
          oldValue: { paymentStatus: invoice.paymentStatus },
          newValue: {
            paymentStatus: PaymentStatus.REFUNDED,
            reason: dto.reason,
            refundReference: dto.refundReference,
          },
        },
        tx,
      );

      return updated;
    });
  }
}

