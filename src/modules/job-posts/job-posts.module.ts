import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import {
  AdminJobPostsController,
  JobPostsController,
  RecruiterJobPostsController,
} from './job-posts.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [JobPostsController, RecruiterJobPostsController, AdminJobPostsController],
  providers: [JobPostsService, PrismaService],
})
export class JobPostsModule {}
