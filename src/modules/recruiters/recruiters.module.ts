import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecruiterAccountsController } from './recruiter-accounts.controller';
import { RecruiterProfilesController } from './recruiter-profiles.controller';
import { RecruitersService } from './recruiters.service';

@Module({
  controllers: [RecruiterAccountsController, RecruiterProfilesController],
  providers: [RecruitersService, PrismaService],
})
export class RecruitersModule {}
