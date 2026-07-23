import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, CompanyStatus } from '@prisma/client';
import { ALLOW_WHEN_RESTRICTED_KEY } from '../../../common/decorators/allow-when-restricted.decorator';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class RestrictedModeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || user.role !== ActorType.RECRUITER) return true;
    if (user.companyStatus !== CompanyStatus.RESTRICTED) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_RESTRICTED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowed) return true;

    throw new ForbiddenException(
      'Company is currently in Restricted Mode. Only read-only access and appeals are allowed.',
    );
  }
}
