import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ActorType } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JobCategoriesController } from '../job-categories/job-categories.controller';
import { SpecializationsController } from '../specializations/specializations.controller';
import { SkillsController } from './skills.controller';

type Controller = { prototype: object };

/** Reads the decorator metadata off a handler without referencing it as an unbound method. */
function handlerOf(controller: Controller, method: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, method);
  if (typeof descriptor?.value !== 'function') {
    throw new Error(`${method} is not a handler on this controller`);
  }
  return descriptor.value as object;
}

function guardNamesOf(controller: Controller, method: string) {
  const guards = (Reflect.getMetadata(GUARDS_METADATA, handlerOf(controller, method)) ??
    []) as Array<{ name: string }>;
  return guards.map((guard) => guard.name);
}

function rolesOf(controller: Controller, method: string) {
  return (Reflect.getMetadata(ROLES_KEY, handlerOf(controller, method)) ?? []) as ActorType[];
}

describe('catalog write endpoints', () => {
  const writeHandlers: Array<[string, Controller, string, ActorType[]]> = [
    [
      'POST /skills',
      SkillsController,
      'create',
      [ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN],
    ],
    ['PATCH /skills/:id', SkillsController, 'update', [ActorType.ADMIN]],
    ['DELETE /skills/:id', SkillsController, 'remove', [ActorType.ADMIN]],
    ['POST /skill-categories', SkillsController, 'createCategory', [ActorType.ADMIN]],
    [
      'POST /specializations',
      SpecializationsController,
      'create',
      [ActorType.RECRUITER, ActorType.ADMIN],
    ],
    ['PATCH /specializations/:id', SpecializationsController, 'update', [ActorType.ADMIN]],
    ['DELETE /specializations/:id', SpecializationsController, 'remove', [ActorType.ADMIN]],
    ['POST /job-categories', JobCategoriesController, 'create', [ActorType.ADMIN]],
    ['PATCH /job-categories/:id', JobCategoriesController, 'update', [ActorType.ADMIN]],
    ['DELETE /job-categories/:id', JobCategoriesController, 'remove', [ActorType.ADMIN]],
  ];

  it.each(writeHandlers)(
    '%s requires auth and the expected roles',
    (_label, controller, method, roles) => {
      const guards = guardNamesOf(controller, method);
      expect(guards).toContain(JwtAuthGuard.name);
      expect(guards).toContain(RolesGuard.name);
      expect(rolesOf(controller, method)).toEqual(roles);
    },
  );

  // The public site loads these before anyone signs in; a guard here would break the job pages.
  const readHandlers: Array<[string, Controller, string]> = [
    ['GET /skills', SkillsController, 'findAll'],
    ['GET /skills/search', SkillsController, 'search'],
    ['GET /skills/:id', SkillsController, 'findOne'],
    ['GET /skill-categories', SkillsController, 'findAllCategories'],
    ['GET /specializations', SpecializationsController, 'findAll'],
    ['GET /specializations/:id', SpecializationsController, 'findOne'],
    ['GET /job-categories', JobCategoriesController, 'findAll'],
    ['GET /job-categories/:id', JobCategoriesController, 'findOne'],
  ];

  it.each(readHandlers)('%s stays public', (_label, controller, method) => {
    expect(guardNamesOf(controller, method)).toEqual([]);
    expect(rolesOf(controller, method)).toEqual([]);
  });
});
