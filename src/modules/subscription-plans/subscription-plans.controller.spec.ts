import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SubscriptionPlansController } from './subscription-plans.controller';

/**
 * `findAll()` and `findOne()` used to carry no guard at all: any unauthenticated
 * caller could enumerate every plan -- including drafts and retired plans, full
 * price and feature limits included -- by hitting `GET /subscription-plans` or
 * guessing a UUID on `GET /subscription-plans/:id`.
 *
 * These tests read the actual decorator metadata off the controller class, the
 * same way `JwtAuthGuard`/`RolesGuard` do at request time via `Reflector`. That
 * makes this a true regression test for the exact mechanism that failed, not
 * just a check that *a* guard decorator is textually present somewhere.
 */
describe('SubscriptionPlansController route guards', () => {
  const reflector = new Reflector();

  function rolesFor(methodName: keyof SubscriptionPlansController): ActorType[] | undefined {
    return reflector.get<ActorType[]>(ROLES_KEY, SubscriptionPlansController.prototype[methodName]);
  }

  it('requires ADMIN on findAll -- the route that lists every plan', () => {
    expect(rolesFor('findAll')).toEqual([ActorType.ADMIN]);
  });

  it('requires ADMIN on findOne -- a single plan by id, including drafts', () => {
    expect(rolesFor('findOne')).toEqual([ActorType.ADMIN]);
  });

  it('does not touch findPublic -- the pricing page must stay unauthenticated', () => {
    expect(rolesFor('findPublic')).toBeUndefined();
  });

  it('leaves the existing ADMIN-only routes untouched', () => {
    expect(rolesFor('create')).toEqual([ActorType.ADMIN]);
    expect(rolesFor('setFeatures')).toEqual([ActorType.ADMIN]);
    expect(rolesFor('update')).toEqual([ActorType.ADMIN]);
    expect(rolesFor('remove')).toEqual([ActorType.ADMIN]);
  });
});
