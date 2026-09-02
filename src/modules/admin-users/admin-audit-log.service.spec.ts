import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminAuditLogService } from './admin-audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminAuditLogService', () => {
  let service: AdminAuditLogService;
  let prisma: {
    adminAuditLog: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      adminAuditLog: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminAuditLogService>(AdminAuditLogService);
  });

  describe('log', () => {
    it('should sanitize sensitive keys and record audit log', async () => {
      prisma.adminAuditLog.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        adminId: 'admin-1',
        action: 'UPDATE_PASSWORD',
        oldValue: { password: 'secret-old-pwd', email: 'admin@test.com' },
        newValue: { password: 'secret-new-pwd', email: 'admin@test.com' },
      });

      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'UPDATE_PASSWORD',
          oldValue: { password: '[REDACTED]', email: 'admin@test.com' },
          newValue: { password: '[REDACTED]', email: 'admin@test.com' },
        }),
      });
    });
  });

  describe('findAuditLogs', () => {
    it('should paginate and filter audit logs correctly', async () => {
      prisma.adminAuditLog.count.mockResolvedValue(25);
      prisma.adminAuditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'INVOICE_REFUNDED' },
      ]);

      const result = await service.findAuditLogs({
        page: 2,
        limit: 10,
        search: 'INVOICE',
        action: 'INVOICE_REFUNDED',
      });

      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(3);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getAuditLogStats', () => {
    it('should return calculated audit log KPIs', async () => {
      prisma.adminAuditLog.count
        .mockResolvedValueOnce(150) // total
        .mockResolvedValueOnce(12); // today
      prisma.adminAuditLog.findMany.mockResolvedValueOnce([
        { adminId: 'admin-1' },
        { adminId: 'admin-2' },
      ]);
      prisma.adminAuditLog.groupBy.mockResolvedValueOnce([
        { action: 'APPROVE_JOB_POST', _count: { action: 45 } },
      ]);

      const stats = await service.getAuditLogStats();

      expect(stats.totalLogs).toBe(150);
      expect(stats.todayLogs).toBe(12);
      expect(stats.activeAdmins).toBe(2);
      expect(stats.topAction).toBe('APPROVE_JOB_POST');
    });
  });

  describe('findAuditLogById', () => {
    it('should return log if found', async () => {
      const mockLog = { id: 'log-1', action: 'VIEW_USER_AUDIT' };
      prisma.adminAuditLog.findUnique.mockResolvedValue(mockLog);

      const res = await service.findAuditLogById('log-1');
      expect(res).toEqual(mockLog);
    });

    it('should throw NotFoundException if log not found', async () => {
      prisma.adminAuditLog.findUnique.mockResolvedValue(null);

      await expect(service.findAuditLogById('not-found')).rejects.toThrow(NotFoundException);
    });
  });
});
