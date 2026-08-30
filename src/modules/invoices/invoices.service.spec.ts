/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { ActorType, PaymentStatus } from '@prisma/client';
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
      findMany: jest.fn(),
      update: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(prismaMock)),
  };

  const subscriptionServiceMock = {
    subscribe: jest.fn(),
    // The paid-invoice path no longer goes through `subscribe` (which is the
    // admin-grant entry point). It calls the shared activation transaction
    // directly, so the mock has to expose that too.
    activatePlanForCompany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CompanySubscriptionsService, useValue: subscriptionServiceMock },
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
      await expect(service.pay('inv-1', user, { paymentMethod: 'SEPAY' })).rejects.toThrow(
        /SePay/,
      );

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
});
