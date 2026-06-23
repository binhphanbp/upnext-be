import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType, PaymentStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: CompanySubscriptionsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateInvoiceDto) {
    let targetCompanyId: string;

    if (user.role === ActorType.ADMIN) {
      if (!dto.companyId) {
        throw new BadRequestException('companyId is required for admin');
      }
      targetCompanyId = dto.companyId;
    } else if (user.role === ActorType.RECRUITER) {
      if (!user.companyId) {
        throw new ForbiddenException('You are not associated with any company');
      }
      targetCompanyId = user.companyId;
    } else {
      throw new ForbiddenException('Only admins and recruiters can create invoices');
    }

    const company = await this.prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!company) throw new NotFoundException('Company not found');

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.subscriptionPlanId } });
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
    if (user.role !== ActorType.ADMIN && invoice.companyId !== user.companyId) {
      throw new ForbiddenException('You do not have permission to view this invoice');
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

    if (!user.companyId) throw new ForbiddenException('Not associated with a company');
    return this.prisma.invoice.findMany({
      where: { companyId: user.companyId },
      include: { subscriptionPlan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pay(id: string, user: AuthenticatedUser, dto: PayInvoiceDto) {
    const invoice = await this.findOne(id, user);

    if (invoice.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This invoice has already been paid');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật hóa đơn thành PAID
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: dto.paymentMethod,
          paidAt: new Date(),
        },
      });

      // 2. Kích hoạt gói dịch vụ tương ứng
      await this.subscriptionService.subscribe(user, {
        planId: invoice.subscriptionPlanId,
        companyId: invoice.companyId,
      });

      return updatedInvoice;
    });
  }
}
