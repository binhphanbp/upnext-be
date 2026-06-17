import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { CompanyMembersModule } from './modules/company-members/company-members.module';
import { RecruiterRolesModule } from './modules/recruiter-roles/recruiter-roles.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { CandidateProfileModule } from './modules/candidate-profile/candidate-profile.module';
import { PrismaModule } from './prisma/prisma.module';
import { JobPostsModule } from './modules/job-posts/job-posts.module';
import { SavedJobsModule } from './modules/saved-jobs/saved-jobs.module';
import { CompanyFollowsModule } from './modules/company-follows/company-follows.module';
import { CompanyReviewsModule } from './modules/company-reviews/company-reviews.module';
import { RecruiterShortlistsModule } from './modules/recruiter-shortlists/recruiter-shortlists.module';
import { JobCategoriesModule } from './modules/job-categories/job-categories.module';
import { EmploymentTypesModule } from './modules/employment-types/employment-types.module';
import { ExperienceLevelsModule } from './modules/experience-levels/experience-levels.module';
import { SpecializationsModule } from './modules/specializations/specializations.module';
import { JobLocationsModule } from './modules/job-locations/job-locations.module';
import { SkillsModule } from './modules/skills/skills.module';
import { HomeModule } from './modules/home/home.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AuthModule,
    AdminUsersModule,
    CompaniesModule,
    RecruitersModule,
    CompanyMembersModule,
    RecruiterRolesModule,
    PrismaModule,
    CandidateAccountModule,
    CandidateProfileModule,
    JobPostsModule,
    SavedJobsModule,
    CompanyFollowsModule,
    CompanyReviewsModule,
    RecruiterShortlistsModule,
    JobCategoriesModule,
    EmploymentTypesModule,
    ExperienceLevelsModule,
    SpecializationsModule,
    JobLocationsModule,
    SkillsModule,
    HomeModule,
    ApplicationsModule,
  ],
})
export class AppModule {}
