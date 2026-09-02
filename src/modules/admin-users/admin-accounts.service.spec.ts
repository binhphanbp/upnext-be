import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminStatus, RoleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuditLogService } from './admin-audit-log.service';

describe('AdminAccountsService', () => {
  let service: AdminAccountsService;

  const mockAuthService = {
    hashPassword: jest.fn().mockResolvedValue('$2a$10$hashedPasswordValue'),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrismaService = {
    adminUser: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminRole: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((cb: (tx: any) => unknown) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAccountsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: AdminAuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<AdminAccountsService>(AdminAccountsService);
  });

  describe('findAll', () => {
    it('should paginate and filter non-deleted admin users', async () => {
      mockPrismaService.adminUser.count.mockResolvedValue(1);
      mockPrismaService.adminUser.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          email: 'admin@upnext.dev',
          fullName: 'Admin User',
          status: AdminStatus.ACTIVE,
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10, q: 'admin' });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should prevent duplicate email (case-insensitive)', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.create('creator-id', {
          email: 'ADMIN@upnext.dev',
          fullName: 'Test Admin',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent assigning INACTIVE role', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue(null);
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'role-inactive',
        status: RoleStatus.INACTIVE,
      });

      await expect(
        service.create('creator-id', {
          email: 'new@upnext.dev',
          fullName: 'New Admin',
          password: 'Password123!',
          roleId: 'role-inactive',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should hash password and create admin with audit log', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue(null);
      mockPrismaService.adminUser.create.mockResolvedValue({
        id: 'new-id',
        email: 'new@upnext.dev',
        fullName: 'New Admin',
        status: AdminStatus.ACTIVE,
      });

      const result = await service.create('creator-id', {
        email: 'NEW@UPNEXT.DEV ',
        fullName: 'New Admin',
        password: 'Password123!',
      });

      expect(mockAuthService.hashPassword).toHaveBeenCalledWith('Password123!');
      expect(mockPrismaService.adminUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@upnext.dev',
            passwordHash: '$2a$10$hashedPasswordValue',
            tokenVersion: 0,
          }),
        }),
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_CREATED' }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should prevent self-locking', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'current-admin-id',
        status: AdminStatus.ACTIVE,
        role: { roleCode: 'MODERATOR' },
      });

      await expect(
        service.update('current-admin-id', 'current-admin-id', { status: AdminStatus.LOCKED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent locking the last active Super Admin', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'super-admin-id',
        status: AdminStatus.ACTIVE,
        role: { roleCode: 'SUPER_ADMIN' },
      });
      mockPrismaService.adminUser.count.mockResolvedValue(0); // 0 other active super admins

      await expect(
        service.update('super-admin-id', 'caller-id', { status: AdminStatus.LOCKED }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent demoting the last active Super Admin', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'super-admin-id',
        roleId: 'super-role-id',
        status: AdminStatus.ACTIVE,
        role: { roleCode: 'SUPER_ADMIN' },
      });
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'mod-role-id',
        status: RoleStatus.ACTIVE,
      });
      mockPrismaService.adminUser.count.mockResolvedValue(0);

      await expect(
        service.update('super-admin-id', 'caller-id', { roleId: 'mod-role-id' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should invalidate tokenVersion on role change', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'admin-1',
        roleId: 'role-1',
        status: AdminStatus.ACTIVE,
        role: { roleCode: 'MODERATOR' },
      });
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'role-2',
        status: RoleStatus.ACTIVE,
      });
      mockPrismaService.adminUser.update.mockResolvedValue({
        id: 'admin-1',
        roleId: 'role-2',
      });

      await service.update('admin-1', 'caller-id', { roleId: 'role-2' });

      expect(mockPrismaService.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('should hash new password, increment tokenVersion and record audit', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'admin-1',
        status: AdminStatus.ACTIVE,
      });
      mockPrismaService.adminUser.update.mockResolvedValue({ id: 'admin-1' });

      await service.resetPassword('admin-1', 'caller-id', { newPassword: 'NewSecurePassword123!' });

      expect(mockAuthService.hashPassword).toHaveBeenCalledWith('NewSecurePassword123!');
      expect(mockPrismaService.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: '$2a$10$hashedPasswordValue',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_PASSWORD_RESET' }),
        expect.anything(),
      );
    });
  });

  describe('lock and remove', () => {
    it('should prevent self-deletion', async () => {
      await expect(service.remove('current-admin-id', 'current-admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should soft delete and increment tokenVersion', async () => {
      mockPrismaService.adminUser.findFirst.mockResolvedValue({
        id: 'target-id',
        status: AdminStatus.ACTIVE,
        role: { roleCode: 'SUPPORT' },
      });

      await service.remove('target-id', 'caller-id');

      expect(mockPrismaService.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'target-id' },
          data: expect.objectContaining({
            status: AdminStatus.INACTIVE,
            tokenVersion: { increment: 1 },
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_ARCHIVED' }),
        expect.anything(),
      );
    });
  });
});
