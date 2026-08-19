import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeatureGuard } from './feature.guard';
import { CandidateSubscriptionController } from './candidate-subscription.controller';
import { CandidateSubscriptionQuotaService } from './candidate-subscription-quota.service';
import { SubscriptionQuotaController } from './subscription-quota.controller';
import { SubscriptionQuotaService } from './subscription-quota.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionQuotaController, CandidateSubscriptionController],
  providers: [
    SubscriptionQuotaService,
    CandidateSubscriptionQuotaService,
    SubscriptionLifecycleService,
    FeatureGuard,
  ],
  exports: [
    SubscriptionQuotaService,
    CandidateSubscriptionQuotaService,
    SubscriptionLifecycleService,
    FeatureGuard,
  ],
})
export class SubscriptionsModule {}
