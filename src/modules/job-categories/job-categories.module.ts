import { Module } from '@nestjs/common';
import { JobCategoriesService } from './job-categories.service';
import { JobCategoriesController } from './job-categories.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [JobCategoriesController],
  providers: [JobCategoriesService, PrismaService],
})
export class JobCategoriesModule {}
