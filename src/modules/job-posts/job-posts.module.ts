import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import { JobBoostService } from './job-boost.service';
import { JobBoostExpirationService } from './job-boost-expiration.service';
import {
  AdminJobPostsController,
  JobPostsController,
  RecruiterJobPostsController,
} from './job-posts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [NotificationsModule, SubscriptionsModule],
  controllers: [JobPostsController, RecruiterJobPostsController, AdminJobPostsController],
  providers: [JobPostsService, JobBoostService, JobBoostExpirationService],
})
export class JobPostsModule {}

