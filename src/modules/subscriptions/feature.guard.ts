import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { REQUIRES_FEATURE_KEY } from '../../common/decorators/requires-feature.decorator';
import { SubscriptionQuotaService } from './subscription-quota.service';
import { SubscriptionFeature } from './feature-registry';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<SubscriptionFeature | undefined>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // Admins bypass plan gating so support staff can act on behalf of a company.
    if (user?.role === ActorType.ADMIN) {
      return true;
    }

    if (!user?.companyId) {
      throw new ForbiddenException({
        code: 'NO_COMPANY',
        message: 'This action requires a company account',
      });
    }

    await this.quota.assertFeatureEnabled(user.companyId, feature);
    return true;
  }
}
