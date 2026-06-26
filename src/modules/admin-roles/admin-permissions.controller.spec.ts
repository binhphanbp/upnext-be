import { Test, TestingModule } from '@nestjs/testing';
import { AdminPermissionsController } from './admin-permissions.controller';
import { AdminRolesService } from './admin-roles.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminPermissionsController', () => {
  let controller: AdminPermissionsController;

  const mockAdminRolesService = {
    findAllPermissions: jest.fn(),
    findOnePermission: jest.fn(),
    createPermission: jest.fn(),
    updatePermission: jest.fn(),
    removePermission: jest.fn(),
  };

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPermissionsController],
      providers: [
        {
          provide: AdminRolesService,
          useValue: mockAdminRolesService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<AdminPermissionsController>(AdminPermissionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
