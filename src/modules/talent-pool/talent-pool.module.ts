import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TalentPoolController } from './talent-pool.controller';
import { TalentPoolService } from './talent-pool.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [TalentPoolController],
  providers: [TalentPoolService],
})
export class TalentPoolModule {}
