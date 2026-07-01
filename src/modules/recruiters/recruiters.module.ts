import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecruiterAuthController } from './recruiter-auth.controller';
import { RecruiterAuthService } from './recruiter-auth.service';
import { RecruiterPasswordResetController } from './recruiter-password-reset.controller';
import { RecruiterAccountsController } from './recruiter-accounts.controller';
import { RecruiterProfilesController } from './recruiter-profiles.controller';
import { RecruitersService } from './recruiters.service';
import { RecruiterAccountEmailVerificationController } from './recruiter-account-email-verification.controller';

@Module({
  controllers: [
    RecruiterAuthController,
    RecruiterPasswordResetController,
    RecruiterAccountsController,
    RecruiterProfilesController,
    RecruiterAccountEmailVerificationController,
  ],
  providers: [RecruiterAuthService, RecruitersService, PrismaService],
})
export class RecruitersModule {}
