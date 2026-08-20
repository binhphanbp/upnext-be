import { SetMetadata } from '@nestjs/common';
import { SubscriptionFeature } from '../../modules/subscriptions/feature-registry';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marks a route as requiring the company's active plan to expose a feature.
 *
 * This is only a pre-check -- it does not consume quota. Metered actions must
 * still call `SubscriptionQuotaService.consume()` inside their own transaction,
 * so quota is never spent on an action that later fails.
 */
export const RequiresFeature = (feature: SubscriptionFeature) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
