import { Module } from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import { JobPostsController, RecruiterJobPostsController } from './job-posts.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [JobPostsController, RecruiterJobPostsController],
  providers: [JobPostsService, PrismaService],
})
export class JobPostsModule {}
