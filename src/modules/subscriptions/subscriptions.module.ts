import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FeatureGuard } from './feature.guard';
import { SubscriptionQuotaController } from './subscription-quota.controller';
import { SubscriptionQuotaService } from './subscription-quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionQuotaController],
  providers: [SubscriptionQuotaService, FeatureGuard],
  exports: [SubscriptionQuotaService, FeatureGuard],
})
export class SubscriptionsModule {}
