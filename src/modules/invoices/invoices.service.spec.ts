import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { AdminAuditLogService } from '../admin-users/admin-audit-log.service';
import { ActorType, PaymentMethod, PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const prismaMock: any = {
    company: {
      findUnique: jest.fn(),
    },
    subscriptionPlan: {
      findUnique: jest.fn(),
    },
    invoice: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    companySubscription: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async <T>(cb: (tx: typeof prismaMock) => Promise<T>): Promise<T> => cb(prismaMock)),
  };

  const subscriptionServiceMock = {
    subscribe: jest.fn(),
    activatePlanForCompany: jest.fn(),
  };

  const auditLogServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CompanySubscriptionsService, useValue: subscriptionServiceMock },
        { provide: AdminAuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns all invoices for the recruiter company', async () => {
      const user: AuthenticatedUser = {
        id: 'recruiter-id',
        email: 'recruiter@fpt.com',
        role: ActorType.RECRUITER,
        companyId: 'fpt-company-id',
        permissions: [],
      };

      const mockInvoices = [
        {
          id: 'inv-1',
          invoiceCode: 'INV-1',
          companyId: 'fpt-company-id',
          amount: '490000',
          paymentStatus: PaymentStatus.PAID,
        },
      ];

      prismaMock.invoice.findMany.mockResolvedValue(mockInvoices);

      const result = await service.findAll(user);
      expect(result).toEqual(mockInvoices);
      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
        where: { companyId: 'fpt-company-id' },
        include: { subscriptionPlan: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('pay', () => {
    it('refuses a recruiter self-confirming a SePay transfer', async () => {
      // SePay is webhook-verified, so "I paid" from the recruiter proves nothing.
      // Only the webhook (or an admin override) may settle a SEPAY invoice.
      const user: AuthenticatedUser = {
        id: 'recruiter-id',
        email: 'recruiter@fpt.com',
        role: ActorType.RECRUITER,
        companyId: 'fpt-company-id',
        permissions: [],
      };

      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        invoiceCode: 'INV-1',
        companyId: 'fpt-company-id',
        subscriptionPlanId: 'plan-1',
        amount: '490000',
        paymentStatus: PaymentStatus.PENDING,
      });

      // Assert on the message, not just the type: the company-ownership check
      // above this one throws ForbiddenException too, so the type alone would
      // let this test pass for the wrong reason.
      await expect(service.pay('inv-1', user, { paymentMethod: 'SEPAY' })).rejects.toThrow(/SePay/);

      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
      expect(subscriptionServiceMock.activatePlanForCompany).not.toHaveBeenCalled();
    });

    it('allows recruiter to pay invoice for their company and activates subscription', async () => {
      const user: AuthenticatedUser = {
        id: 'recruiter-id',
        email: 'recruiter@fpt.com',
        role: ActorType.RECRUITER,
        companyId: 'fpt-company-id',
        permissions: [],
      };

      const mockInvoice = {
        id: 'inv-1',
        invoiceCode: 'INV-1',
        companyId: 'fpt-company-id',
        subscriptionPlanId: 'plan-1',
        amount: '490000',
        paymentStatus: PaymentStatus.PENDING,
      };

      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.invoice.update.mockResolvedValue({
        ...mockInvoice,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: 'PAYPAL',
        paidAt: new Date(),
      });

      // PAYPAL stays self-confirmable: it has no webhook verifying the transfer,
      // unlike SEPAY (covered by the test above).
      const result = await service.pay('inv-1', user, { paymentMethod: 'PAYPAL' });

      expect(prismaMock.invoice.update).toHaveBeenCalled();
      expect(subscriptionServiceMock.activatePlanForCompany).toHaveBeenCalledWith(
        'fpt-company-id',
        'plan-1',
        expect.any(String),
        expect.anything(),
      );
      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('rejects payment if invoice belongs to another company', async () => {
      const user: AuthenticatedUser = {
        id: 'recruiter-id',
        email: 'recruiter@fpt.com',
        role: ActorType.RECRUITER,
        companyId: 'other-company-id',
        permissions: [],
      };

      const mockInvoice = {
        id: 'inv-1',
        invoiceCode: 'INV-1',
        companyId: 'fpt-company-id',
        subscriptionPlanId: 'plan-1',
        amount: '490000',
        paymentStatus: PaymentStatus.PENDING,
      };

      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);

      // Same reason as above: pin the message so this proves the ownership
      // check fired, not the SePay one.
      await expect(service.pay('inv-1', user, { paymentMethod: 'SEPAY' })).rejects.toThrow(
        /permission to view this invoice/,
      );
    });
  });

  describe('findAdminInvoices', () => {
    it('applies search, pagination, and status filters properly', async () => {
      prismaMock.invoice.count.mockResolvedValue(1);
      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-100',
          invoiceCode: 'INV-2026-001',
          amount: 5000000,
          paymentStatus: PaymentStatus.PAID,
          company: { name: 'VNG Corp', taxCode: '0304123456' },
        },
      ]);

      const result = await service.findAdminInvoices({
        page: 1,
        limit: 10,
        search: 'VNG',
        paymentStatus: PaymentStatus.PAID,
      });

      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          where: expect.objectContaining({
            paymentStatus: PaymentStatus.PAID,
          }),
        }),
      );
    });
  });

  describe('getAdminInvoiceStats', () => {
    it('computes total revenue and counts per payment status', async () => {
      prismaMock.invoice.groupBy.mockResolvedValue([
        { paymentStatus: PaymentStatus.PAID, _count: { id: 10 } },
        { paymentStatus: PaymentStatus.PENDING, _count: { id: 3 } },
        { paymentStatus: PaymentStatus.FAILED, _count: { id: 1 } },
        { paymentStatus: PaymentStatus.REFUNDED, _count: { id: 1 } },
      ]);
      prismaMock.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 50000000 } })
        .mockResolvedValueOnce({ _sum: { amount: 6000000 } });

      const stats = await service.getAdminInvoiceStats();

      expect(stats.totalRevenue).toBe(50000000);
      expect(stats.pendingRevenue).toBe(6000000);
      expect(stats.totalCount).toBe(15);
      expect(stats.paidCount).toBe(10);
      expect(stats.pendingCount).toBe(3);
      expect(stats.failedCount).toBe(1);
      expect(stats.refundedCount).toBe(1);
    });
  });

  describe('manualConfirmInvoice', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@upnext.dev',
      role: ActorType.ADMIN,
      permissions: ['billing:invoices'],
    };

    it('successfully confirms payment, activates plan, and creates audit log', async () => {
      const mockInvoice = {
        id: 'inv-1',
        invoiceCode: 'INV-1',
        companyId: 'comp-1',
        subscriptionPlanId: 'plan-1',
        amount: 2500000,
        paymentStatus: PaymentStatus.PENDING,
      };

      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.invoice.update.mockResolvedValue({
        ...mockInvoice,
        paymentStatus: PaymentStatus.PAID,
        paymentReference: 'BANK-REF-12345',
      });

      const result = await service.manualConfirmInvoice(
        'inv-1',
        {
          paymentReference: 'BANK-REF-12345',
          paymentMethod: PaymentMethod.SEPAY,
          adminNote: 'Sao kê khớp lúc 15:00',
        },
        adminUser,
        '127.0.0.1',
        'jest-agent',
      );

      expect(prismaMock.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.PAID,
            paymentReference: 'BANK-REF-12345',
            adminNote: 'Sao kê khớp lúc 15:00',
          }),
        }),
      );
      expect(subscriptionServiceMock.activatePlanForCompany).toHaveBeenCalledWith(
        'comp-1',
        'plan-1',
        'ADMIN_MANUAL_CONFIRM',
        expect.anything(),
      );
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_MANUAL_PAID',
          adminId: 'admin-1',
          targetId: 'inv-1',
        }),
        expect.anything(),
      );
      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('rejects manual confirmation if invoice was already paid', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        paymentStatus: PaymentStatus.PAID,
      });

      await expect(
        service.manualConfirmInvoice(
          'inv-1',
          { paymentReference: 'REF' },
          adminUser,
        ),
      ).rejects.toThrow(/đã được thanh toán/);
    });
  });

  describe('cancelInvoice', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@upnext.dev',
      role: ActorType.ADMIN,
      permissions: ['billing:invoices'],
    };

    it('successfully cancels a pending invoice', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-pending',
        paymentStatus: PaymentStatus.PENDING,
      });
      prismaMock.invoice.update.mockResolvedValue({
        id: 'inv-pending',
        paymentStatus: PaymentStatus.FAILED,
      });

      const result = await service.cancelInvoice(
        'inv-pending',
        { reason: 'Khách hàng hủy mua' },
        adminUser,
      );

      expect(prismaMock.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-pending' },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.FAILED,
            cancelledReason: 'Khách hàng hủy mua',
          }),
        }),
      );
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_CANCELLED',
        }),
        expect.anything(),
      );
      expect(result.paymentStatus).toBe(PaymentStatus.FAILED);
    });

    it('rejects cancellation of an already paid invoice', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-paid',
        paymentStatus: PaymentStatus.PAID,
      });

      await expect(
        service.cancelInvoice('inv-paid', { reason: 'test' }, adminUser),
      ).rejects.toThrow(/Không thể hủy hóa đơn đã thanh toán/);
    });
  });

  describe('refundInvoice', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@upnext.dev',
      role: ActorType.ADMIN,
      permissions: ['billing:invoices'],
    };

    it('successfully refunds a paid invoice and deactivates subscription', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-paid',
        companyId: 'comp-1',
        subscriptionPlanId: 'plan-1',
        paymentStatus: PaymentStatus.PAID,
      });
      prismaMock.invoice.update.mockResolvedValue({
        id: 'inv-paid',
        paymentStatus: PaymentStatus.REFUNDED,
      });

      const result = await service.refundInvoice(
        'inv-paid',
        {
          reason: 'Chuyển khoản nhầm 2 lần',
          refundReference: 'REF-BANK-7788',
        },
        adminUser,
      );

      expect(prismaMock.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-paid' },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.REFUNDED,
            refundReason: 'Chuyển khoản nhầm 2 lần',
            refundReference: 'REF-BANK-7788',
          }),
        }),
      );
      expect(prismaMock.companySubscription.updateMany).toHaveBeenCalledWith({
        where: {
          companyId: 'comp-1',
          planId: 'plan-1',
          status: 'ACTIVE',
        },
        data: {
          status: 'CANCELLED',
        },
      });
      expect(result.paymentStatus).toBe(PaymentStatus.REFUNDED);
    });

    it('rejects refund if invoice is not PAID', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv-pending',
        paymentStatus: PaymentStatus.PENDING,
      });

      await expect(
        service.refundInvoice('inv-pending', { reason: 'test' }, adminUser),
      ).rejects.toThrow(/Chỉ có thể hoàn tiền đối với hóa đơn đã thanh toán/);
    });
  });

  describe('create', () => {
    const recruiterUser: AuthenticatedUser = {
      id: 'recruiter-1',
      email: 'recruiter@fpt.com',
      role: ActorType.RECRUITER,
      companyId: 'comp-1',
      permissions: [],
    };

    const paidPlan = {
      id: 'plan-pro-id',
      subscriptionName: 'Pro',
      price: '1490000',
      status: SubscriptionStatus.ACTIVE,
    };

    it('creates an invoice successfully when recruiter has no active paid plan', async () => {
      prismaMock.company.findUnique.mockResolvedValue({ id: 'comp-1' });
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue(paidPlan);
      prismaMock.companySubscription.findFirst.mockResolvedValue(null);
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.invoice.create.mockResolvedValue({
        id: 'new-inv-id',
        invoiceCode: 'INV-20260903-1234',
        paymentStatus: PaymentStatus.PENDING,
        subscriptionPlan: paidPlan,
      });

      const result = await service.create(recruiterUser, { subscriptionPlanId: 'plan-pro-id' });
      expect(result.id).toBe('new-inv-id');
      expect(prismaMock.invoice.create).toHaveBeenCalled();
    });

    it('blocks recruiter when company already has active paid plan with > 3 days left', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days left
      prismaMock.company.findUnique.mockResolvedValue({ id: 'comp-1' });
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue(paidPlan);
      prismaMock.companySubscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        planId: 'plan-pro-id',
        status: SubscriptionStatus.ACTIVE,
        expiredAt: futureDate,
        plan: paidPlan,
      });

      await expect(
        service.create(recruiterUser, { subscriptionPlanId: 'plan-pro-id' }),
      ).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_ALREADY_ACTIVE' },
      });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('allows renewal invoice when company active plan has <= 3 days left', async () => {
      const nearExpiryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days left
      prismaMock.company.findUnique.mockResolvedValue({ id: 'comp-1' });
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue(paidPlan);
      prismaMock.companySubscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        planId: 'plan-pro-id',
        status: SubscriptionStatus.ACTIVE,
        expiredAt: nearExpiryDate,
        plan: paidPlan,
      });
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.invoice.create.mockResolvedValue({
        id: 'renewal-inv-id',
        invoiceCode: 'INV-RENEW-01',
        paymentStatus: PaymentStatus.PENDING,
        subscriptionPlan: paidPlan,
      });

      const result = await service.create(recruiterUser, { subscriptionPlanId: 'plan-pro-id' });
      expect(result.id).toBe('renewal-inv-id');
      expect(prismaMock.invoice.create).toHaveBeenCalled();
    });

    it('blocks mid-cycle change to a different paid plan', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      prismaMock.company.findUnique.mockResolvedValue({ id: 'comp-1' });
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'other-plan-id',
        subscriptionName: 'Enterprise',
        price: '5000000',
        status: SubscriptionStatus.ACTIVE,
      });
      prismaMock.companySubscription.findFirst.mockResolvedValue({
        id: 'sub-active',
        planId: 'plan-pro-id',
        status: SubscriptionStatus.ACTIVE,
        expiredAt: futureDate,
        plan: paidPlan,
      });

      await expect(
        service.create(recruiterUser, { subscriptionPlanId: 'other-plan-id' }),
      ).rejects.toMatchObject({
        response: { code: 'SUBSCRIPTION_CHANGE_NOT_SUPPORTED' },
      });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('reuses existing recent PENDING invoice instead of creating duplicate', async () => {
      prismaMock.company.findUnique.mockResolvedValue({ id: 'comp-1' });
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue(paidPlan);
      prismaMock.companySubscription.findFirst.mockResolvedValue(null);
      const existingPending = {
        id: 'existing-pending-inv-id',
        invoiceCode: 'INV-PENDING-001',
        paymentStatus: PaymentStatus.PENDING,
        subscriptionPlan: paidPlan,
      };
      prismaMock.invoice.findFirst.mockResolvedValue(existingPending);

      const result = await service.create(recruiterUser, { subscriptionPlanId: 'plan-pro-id' });
      expect(result).toBe(existingPending);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });
});

