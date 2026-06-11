import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { CompanyMembersModule } from './modules/company-members/company-members.module';
import { RecruiterRolesModule } from './modules/recruiter-roles/recruiter-roles.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { JobPostsModule } from './modules/job-posts/job-posts.module';
import { SavedJobsModule } from './modules/saved-jobs/saved-jobs.module';
import { CompanyFollowsModule } from './modules/company-follows/company-follows.module';
import { CompanyReviewsModule } from './modules/company-reviews/company-reviews.module';
import { RecruiterShortlistsModule } from './modules/recruiter-shortlists/recruiter-shortlists.module';

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
    SavedJobsModule,
    CompanyFollowsModule,
    CompanyReviewsModule,
    RecruiterShortlistsModule,
  ],
})
export class AppModule {}
