import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { ADMIN_PERMISSIONS_KEY } from '../../../common/decorators/admin-permissions.decorator';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

/**
 * Compatibility guard for existing @AdminPermissions decorators.
 * Effective permissions are resolved from the database on every JWT validation;
 * no role name receives an implicit bypass.
 */
@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(ADMIN_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || user.role !== ActorType.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    const effectivePermissions = new Set(user.permissions);
    if (!requiredPermissions.every((permission) => effectivePermissions.has(permission))) {
      throw new ForbiddenException('Insufficient admin permissions');
    }

    return true;
  }
}
