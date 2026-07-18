import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AdminPermissionsGuard } from './admin-permissions.guard';

describe('AdminPermissionsGuard', () => {
  let guard: AdminPermissionsGuard;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPermissionsGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<AdminPermissionsGuard>(AdminPermissionsGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
