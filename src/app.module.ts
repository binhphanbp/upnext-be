import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { AdminRolesModule } from './modules/admin-roles/admin-roles.module';
import { CvsModule } from './modules/cvs/cvs.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { CompanySubscriptionsModule } from './modules/company-subscriptions/company-subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PostsModule } from './modules/posts/posts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchKeywordModule } from './modules/search-keyword/search-keyword.module';
import { CvScreeningModule } from './modules/cv-screening/cv-screening.module';
import { ZaloBotModule } from './modules/zalo-bot/zalo-bot.module';
import { InterviewRemindersModule } from './modules/interview-reminders/interview-reminders.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { TalentOutreachModule } from './modules/talent-outreach/talent-outreach.module';
import { SupportCasesModule } from './modules/support-cases/support-cases.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { HiringReportsModule } from './modules/hiring-reports/hiring-reports.module';
import { AppealsModule } from './modules/appeals/appeals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        // Default budget for routes that explicitly opt in via @UseGuards(ThrottlerGuard).
        // There is intentionally NO global guard: edge-level DoS protection (Cloudflare)
        // handles volumetric abuse. App-level throttling targets brute-force /
        // credential-stuffing on sensitive endpoints only (login/refresh/reset).
        ttl: 60000,
        limit: 100,
      },
    ]),
    CloudinaryModule,
    AuthModule,
    AdminUsersModule,
    AdminRolesModule,
    PostsModule,
    ReportsModule,
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
    SearchKeywordModule,
    NotificationsModule,
    OutboxModule,
    ConversationsModule,
    TalentOutreachModule,
    SupportCasesModule,
    CvScreeningModule,
    ZaloBotModule,
    InterviewRemindersModule,
    ReputationModule,
    HiringReportsModule,
    AppealsModule,
  ],
})
export class AppModule {}
