import { Module } from '@nestjs/common';
import { CandidateAccountService } from './candidate-account.service';
import { CandidateAccountController } from './candidate-account.controller';

@Module({
  controllers: [CandidateAccountController],
  providers: [CandidateAccountService],
  exports: [CandidateAccountService],
})
export class CandidateAccountModule {}
