import { Module } from '@nestjs/common';
import { JobCategoriesService } from './job-categories.service';
import { JobCategoriesController } from './job-categories.controller';

@Module({
  controllers: [JobCategoriesController],
  providers: [JobCategoriesService],
})
export class JobCategoriesModule {}
