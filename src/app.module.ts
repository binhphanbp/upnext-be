import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { CompanyMembersModule } from './modules/company-members/company-members.module';
import { RecruiterRolesModule } from './modules/recruiter-roles/recruiter-roles.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { JobPostsModule } from './modules/job-posts/job-posts.module';

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
    JobPostsModule,
  ],
})
export class AppModule {}
