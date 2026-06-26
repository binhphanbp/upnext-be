import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { validateEnv } from './common/config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { CompanyMembersModule } from './modules/company-members/company-members.module';
import { RecruiterRolesModule } from './modules/recruiter-roles/recruiter-roles.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { CandidateAccountModule } from './modules/candidate-account/candidate-account.module';
import { CandidateCertificationsModule } from './modules/candidate-certifications/candidate-certifications.module';
import { CandidateEducationsModule } from './modules/candidate-educations/candidate-educations.module';
import { CandidateExperiencesModule } from './modules/candidate-experiences/candidate-experiences.module';
import { CandidateJobPreferencesModule } from './modules/candidate-job-preferences/candidate-job-preferences.module';
import { CandidateLanguagesModule } from './modules/candidate-languages/candidate-languages.module';
import { CandidateLinksModule } from './modules/candidate-links/candidate-links.module';
import { CandidateProfileModule } from './modules/candidate-profile/candidate-profile.module';
import { CandidateProjectsModule } from './modules/candidate-projects/candidate-projects.module';
import { CandidateSkillsModule } from './modules/candidate-skills/candidate-skills.module';
import { PrismaModule } from './prisma/prisma.module';
import { JobPostsModule } from './modules/job-posts/job-posts.module';
import { SavedJobsModule } from './modules/saved-jobs/saved-jobs.module';
import { CompanyFollowsModule } from './modules/company-follows/company-follows.module';
import { CompanyReviewsModule } from './modules/company-reviews/company-reviews.module';
import { RecruiterShortlistsModule } from './modules/recruiter-shortlists/recruiter-shortlists.module';
import { JobCategoriesModule } from './modules/job-categories/job-categories.module';
import { EmploymentTypesModule } from './modules/employment-types/employment-types.module';
import { ExperienceLevelsModule } from './modules/experience-levels/experience-levels.module';
import { FilesModule } from './modules/files/files.module';
import { SpecializationsModule } from './modules/specializations/specializations.module';
import { JobLocationsModule } from './modules/job-locations/job-locations.module';
import { SkillsModule } from './modules/skills/skills.module';
import { HomeModule } from './modules/home/home.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { CvsModule } from './modules/cvs/cvs.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { CompanySubscriptionsModule } from './modules/company-subscriptions/company-subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { HealthModule } from './modules/health/health.module';
import { PostsModule } from './modules/posts/posts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CloudinaryModule,
    AuthModule,
    AdminUsersModule,
    PostsModule,
    CompaniesModule,
    RecruitersModule,
    CompanyMembersModule,
    RecruiterRolesModule,
    PrismaModule,
    CandidateAccountModule,
    CandidateProfileModule,
    CandidateEducationsModule,
    CandidateExperiencesModule,
    CandidateSkillsModule,
    CandidateJobPreferencesModule,
    CandidateCertificationsModule,
    CandidateLanguagesModule,
    CandidateLinksModule,
    CandidateProjectsModule,
    JobPostsModule,
    SavedJobsModule,
    CompanyFollowsModule,
    CompanyReviewsModule,
    RecruiterShortlistsModule,
    JobCategoriesModule,
    EmploymentTypesModule,
    ExperienceLevelsModule,
    FilesModule,
    SpecializationsModule,
    JobLocationsModule,
    SkillsModule,
    HomeModule,
    ApplicationsModule,
    CvsModule,
    SubscriptionPlansModule,
    CompanySubscriptionsModule,
    InvoicesModule,
    InterviewsModule,
    HealthModule,
  ],
})
export class AppModule {}
