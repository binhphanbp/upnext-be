import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: CompanySubscriptionsService,
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

  async create(user: AuthenticatedUser, dto: CreateInvoiceDto) {
    let targetCompanyId: string;

    if (user.role === ActorType.ADMIN) {
      if (!dto.companyId) {
        throw new BadRequestException('companyId is required for admin');
      }
      targetCompanyId = dto.companyId;
    } else if (user.role === ActorType.RECRUITER) {
      targetCompanyId = await this.resolveCompanyId(user);
    } else {
      throw new ForbiddenException('Only admins and recruiters can create invoices');
    }

    const company = await this.prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!company) throw new NotFoundException('Company not found');

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.subscriptionPlanId },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    // Tạo mã hóa đơn độc nhất dạng: INV-YYYYMMDD-RANDOM
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceCode = `INV-${dateStr}-${randomStr}`;

    return this.prisma.invoice.create({
      data: {
        subscriptionPlanId: plan.id,
        companyId: targetCompanyId,
        invoiceCode: invoiceCode,
        amount: plan.price,
        paymentStatus: PaymentStatus.PENDING,
      },
      include: {
        subscriptionPlan: true,
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { subscriptionPlan: true, company: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    // Bảo mật: Kiểm tra xem user có quyền xem hóa đơn này không
    if (user.role !== ActorType.ADMIN) {
      const userCompanyId = await this.resolveCompanyId(user);
      if (invoice.companyId !== userCompanyId) {
        throw new ForbiddenException('You do not have permission to view this invoice');
      }
    }

    return invoice;
  }

  async findAll(user: AuthenticatedUser) {
    if (user.role === ActorType.ADMIN) {
      return this.prisma.invoice.findMany({
        include: { company: true, subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    const companyId = await this.resolveCompanyId(user);
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: { subscriptionPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pay(id: string, user: AuthenticatedUser, dto: PayInvoiceDto) {
    const invoice = await this.findOne(id, user);

    if (user.role !== ActorType.ADMIN) {
      const userCompanyId = await this.resolveCompanyId(user);
      if (invoice.companyId !== userCompanyId) {
        throw new ForbiddenException('You do not have permission to pay this invoice');
      }

      // SePay is a real, webhook-verified gateway now (see markPaidByWebhook):
      // a recruiter self-attesting "I paid" through this endpoint is exactly
      // the honor-system gap that made this integration necessary in the
      // first place. Only PayPal -- still genuinely manual/unverified today
      // -- can be self-confirmed. Admins keep a manual override for either,
      // for support cases where the webhook never arrives.
      if (dto.paymentMethod === PaymentMethod.SEPAY) {
        throw new ForbiddenException(
          'Vui lòng chuyển khoản qua SePay -- hệ thống sẽ tự động xác nhận khi nhận được tiền',
        );
      }
    }

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This invoice has already been paid');
    }

    return this.confirmPayment(invoice.id, invoice.companyId, invoice.subscriptionPlanId, {
      paymentMethod: dto.paymentMethod,
      source: 'INVOICE_PAYMENT',
    });
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

    await this.confirmPayment(invoice.id, invoice.companyId, invoice.subscriptionPlanId, {
      paymentMethod,
      paymentReference,
      source: 'SEPAY_WEBHOOK',
    });
    return { handled: true };
  }

  /**
   * Single place where an invoice actually flips to PAID and the matching
   * subscription gets activated -- used by both the manual `pay()` endpoint
   * and the SePay webhook, so there is exactly one transaction to get right.
   */
  private async confirmPayment(
    invoiceId: string,
    companyId: string,
    subscriptionPlanId: string,
    options: { paymentMethod: PaymentMethod; source: string; paymentReference?: string },
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: options.paymentMethod,
          paymentReference: options.paymentReference,
          paidAt: new Date(),
        },
        include: { subscriptionPlan: true },
      });

      await this.subscriptionService.activatePlanForCompany(
        companyId,
        subscriptionPlanId,
        options.source,
        tx,
      );

      return updatedInvoice;
    });
  }
}
