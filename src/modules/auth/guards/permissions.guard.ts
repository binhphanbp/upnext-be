import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  RequiredPermissions,
} from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermissions>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.codes.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const userPermissions = new Set(request.user?.permissions ?? []);
    const allowed =
      required.match === 'all'
        ? required.codes.every((code) => userPermissions.has(code))
        : required.codes.some((code) => userPermissions.has(code));

    if (!allowed) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
