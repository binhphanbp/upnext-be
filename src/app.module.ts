import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { CompanyMembersModule } from './modules/company-members/company-members.module';
import { RecruiterRolesModule } from './modules/recruiter-roles/recruiter-roles.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CompaniesModule,
    RecruitersModule,
    CompanyMembersModule,
    RecruiterRolesModule,
    PrismaModule,
    CandidateAccountModule,
  ],
})
export class AppModule {}
