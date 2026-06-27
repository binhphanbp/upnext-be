import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRolesService } from './admin-roles.service';

describe('AdminRolesService', () => {
  let service: AdminRolesService;

  const mockPrismaService = {
    adminRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminPermission: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminRolePermission: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    adminUser: {
      count: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((cb) => cb(mockPrismaService) as unknown),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRolesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminRolesService>(AdminRolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllRoles', () => {
    it('should return all roles', async () => {
      const mockRoles = [{ id: 'role-1', roleName: 'super_admin' }];
      mockPrismaService.adminRole.findMany.mockResolvedValue(mockRoles);

      const result = await service.findAllRoles();

      expect(result).toEqual(mockRoles);
      expect(mockPrismaService.adminRole.findMany).toHaveBeenCalled();
    });
  });

  describe('findAllPermissions', () => {
    it('should return all permissions', async () => {
      const mockPermissions = [{ id: 'perm-1', permissionCode: 'posts:write' }];
      mockPrismaService.adminPermission.findMany.mockResolvedValue(mockPermissions);

      const result = await service.findAllPermissions();

      expect(result).toEqual(mockPermissions);
      expect(mockPrismaService.adminPermission.findMany).toHaveBeenCalled();
    });
  });
});
