import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import {
  AdminJobPostsController,
  JobPostsController,
  RecruiterJobPostsController,
} from './job-posts.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [JobPostsController, RecruiterJobPostsController, AdminJobPostsController],
  providers: [JobPostsService],
})
export class JobPostsModule {}

