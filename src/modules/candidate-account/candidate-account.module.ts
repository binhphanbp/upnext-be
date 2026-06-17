import { Module } from '@nestjs/common';
import { CandidateAccountAuthController } from './candidate-account-auth.controller';
import { CandidateAccountAuthService } from './candidate-account-auth.service';
import { CandidateAccountEmailVerificationController } from './candidate-account-email-verification.controller';
import { CandidateAccountPasswordResetController } from './candidate-account-password-reset.controller';
import { CandidateAccountService } from './candidate-account.service';
import { CandidateAccountController } from './candidate-account.controller';

@Module({
  controllers: [
    CandidateAccountAuthController,
    CandidateAccountEmailVerificationController,
    CandidateAccountPasswordResetController,
    CandidateAccountController,
  ],
  providers: [CandidateAccountAuthService, CandidateAccountService],
  exports: [CandidateAccountService],
})
export class CandidateAccountModule {}
