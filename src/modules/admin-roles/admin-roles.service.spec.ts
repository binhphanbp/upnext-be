import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../admin-users/admin-audit-log.service';
import { AdminRolesService } from './admin-roles.service';

describe('AdminRolesService', () => {
  let service: AdminRolesService;

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrismaService = {
    adminRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminPermission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminRolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    adminUser: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((cb: (tx: any) => unknown) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRolesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AdminAuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<AdminRolesService>(AdminRolesService);
  });

  describe('findAllRoles', () => {
    it('should return all roles with computed counts', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          roleCode: 'SUPER_ADMIN',
          roleName: 'Super Admin',
          _count: { admins: 3, rolePermissions: 20 },
          rolePermissions: [],
        },
      ];
      mockPrismaService.adminRole.findMany.mockResolvedValue(mockRoles);

      const result = await service.findAllRoles();

      expect(result).toEqual([
        expect.objectContaining({
          id: 'role-1',
          adminsCount: 3,
          permissionsCount: 20,
        }),
      ]);
    });
  });

  describe('createRole', () => {
    it('should prevent creating a role with roleCode SUPER_ADMIN', async () => {
      await expect(
        service.createRole('admin-1', {
          roleCode: 'SUPER_ADMIN',
          roleName: 'Super Admin Fake',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent creating role with duplicate roleCode or roleName', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.createRole('admin-1', {
          roleCode: 'MODERATOR',
          roleName: 'Moderator',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create custom role with permissions', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue(null);
      mockPrismaService.adminPermission.findMany.mockResolvedValue([
        { id: 'perm-1', permissionCode: 'jobs:view' },
      ]);
      const createdRole = {
        id: 'role-new',
        roleCode: 'CUSTOM_REVIEWER',
        roleName: 'Custom Reviewer',
        isSystem: false,
        status: RoleStatus.ACTIVE,
      };
      mockPrismaService.adminRole.create.mockResolvedValue(createdRole);

      const result = await service.createRole('admin-1', {
        roleName: 'Custom Reviewer',
        permissionIds: ['perm-1'],
      });

      expect(result).toEqual(createdRole);
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CREATED' }),
        expect.anything(),
      );
    });
  });

  describe('updateRole', () => {
    it('should prevent setting SUPER_ADMIN role to INACTIVE', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'super-role-id',
        roleCode: 'SUPER_ADMIN',
        status: RoleStatus.ACTIVE,
      });

      await expect(
        service.updateRole('super-role-id', 'admin-1', { status: RoleStatus.INACTIVE }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent disabling a role with active admins', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'role-mod',
        roleCode: 'MODERATOR',
        status: RoleStatus.ACTIVE,
      });
      mockPrismaService.adminUser.count.mockResolvedValue(5);

      await expect(
        service.updateRole('role-mod', 'admin-1', { status: RoleStatus.INACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeRole', () => {
    it('should prevent deleting system role or SUPER_ADMIN', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'super-role-id',
        roleCode: 'SUPER_ADMIN',
        isSystem: true,
      });

      await expect(service.removeRole('super-role-id', 'admin-1')).rejects.toThrow(ForbiddenException);
    });

    it('should prevent deleting role that has assigned admins', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'custom-role-id',
        roleCode: 'CUSTOM',
        isSystem: false,
      });
      mockPrismaService.adminUser.count.mockResolvedValue(2);

      await expect(service.removeRole('custom-role-id', 'admin-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('assignPermissions', () => {
    it('should throw error if any permission ID is invalid', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'role-1',
        roleCode: 'MODERATOR',
      });
      mockPrismaService.adminPermission.findMany.mockResolvedValue([]);

      await expect(
        service.assignPermissions('role-1', 'admin-1', { permissionIds: ['invalid-id'] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent stripping mandatory permissions from SUPER_ADMIN', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'super-id',
        roleCode: 'SUPER_ADMIN',
      });
      mockPrismaService.adminPermission.findMany.mockResolvedValue([
        { id: 'perm-1', permissionCode: 'jobs:view' },
      ]);
      mockPrismaService.adminPermission.count.mockResolvedValue(25);

      await expect(
        service.assignPermissions('super-id', 'admin-1', { permissionIds: ['perm-1'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should sync permissions and invalidate active admin sessions', async () => {
      mockPrismaService.adminRole.findFirst.mockResolvedValue({
        id: 'mod-id',
        roleCode: 'MODERATOR',
        rolePermissions: [],
        _count: { admins: 1, rolePermissions: 1 },
      });
      mockPrismaService.adminPermission.findMany.mockResolvedValue([
        { id: 'perm-1', permissionCode: 'jobs:view' },
      ]);
      mockPrismaService.adminRolePermission.findMany.mockResolvedValue([]);

      await service.assignPermissions('mod-id', 'admin-1', { permissionIds: ['perm-1'] });

      expect(mockPrismaService.adminRolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'mod-id' },
      });
      expect(mockPrismaService.adminRolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'mod-id', permissionId: 'perm-1' }],
      });
      expect(mockPrismaService.adminUser.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roleId: 'mod-id', deletedAt: null },
          data: { tokenVersion: { increment: 1 } },
        }),
      );
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_PERMISSIONS_SYNCED' }),
        expect.anything(),
      );
    });
  });
});
