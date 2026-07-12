import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import {
  AdminJobPostsController,
  JobPostsController,
  RecruiterJobPostsController,
} from './job-posts.controller';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [JobPostsController, RecruiterJobPostsController, AdminJobPostsController],
  providers: [JobPostsService, PrismaService],
})
export class JobPostsModule {}

