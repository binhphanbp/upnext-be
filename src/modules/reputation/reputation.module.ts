import { Module } from '@nestjs/common';
import { ReputationLedgerService } from './reputation-ledger.service';
import { ReputationScoringService } from './reputation-scoring.service';

@Module({
  providers: [ReputationLedgerService, ReputationScoringService],
  exports: [ReputationLedgerService],
})
export class ReputationModule {}
