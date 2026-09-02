import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import { JobBoostService } from './job-boost.service';
import { JobBoostExpirationService } from './job-boost-expiration.service';
import { JobBoostDeliveryService } from './job-boost-delivery.service';
import { SponsoredJobsService } from './sponsored-jobs.service';
import {
  AdminJobPostsController,
  JobPostsController,
  RecruiterJobPostsController,
} from './job-posts.controller';
import { SponsoredJobsController } from './sponsored-jobs.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [NotificationsModule, SubscriptionsModule],
  controllers: [
    JobPostsController,
    RecruiterJobPostsController,
    AdminJobPostsController,
    SponsoredJobsController,
  ],
  providers: [
    JobPostsService,
    JobBoostService,
    JobBoostExpirationService,
    JobBoostDeliveryService,
    SponsoredJobsService,
  ],
})
export class JobPostsModule {}
