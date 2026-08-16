/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanySubscriptionsService } from '../company-subscriptions/company-subscriptions.service';
import { ActorType, PaymentStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
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
        paymentMethod: 'SEPAY',
        paidAt: new Date(),
      });

      const result = await service.pay('inv-1', user, { paymentMethod: 'SEPAY' });

      expect(prismaMock.invoice.update).toHaveBeenCalled();
      expect(subscriptionServiceMock.subscribe).toHaveBeenCalledWith(
        user,
        { planId: 'plan-1', companyId: 'fpt-company-id' },
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

      await expect(service.pay('inv-1', user, { paymentMethod: 'SEPAY' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
