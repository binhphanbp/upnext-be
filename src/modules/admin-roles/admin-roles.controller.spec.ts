import { Test, TestingModule } from '@nestjs/testing';
import { AdminRolesController } from './admin-roles.controller';
import { AdminRolesService } from './admin-roles.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminRolesController', () => {
  let controller: AdminRolesController;

  const mockAdminRolesService = {
    findAllRoles: jest.fn(),
    findOneRole: jest.fn(),
    createRole: jest.fn(),
    updateRole: jest.fn(),
    removeRole: jest.fn(),
    assignPermissions: jest.fn(),
  };

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRolesController],
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

    controller = module.get<AdminRolesController>(AdminRolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
