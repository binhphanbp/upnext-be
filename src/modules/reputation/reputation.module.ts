import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReputationLedgerService } from './reputation-ledger.service';
import { ReputationScoringService } from './reputation-scoring.service';

@Module({
  imports: [NotificationsModule],
  providers: [ReputationLedgerService, ReputationScoringService],
  exports: [ReputationLedgerService],
})
export class ReputationModule {}
