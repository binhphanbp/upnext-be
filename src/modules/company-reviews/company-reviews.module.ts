import { Module } from '@nestjs/common';
import { CompanyReviewsService } from './company-reviews.service';
import {
  CompanyReviewsController,
  CompanyReviewsMutationController,
} from './company-reviews.controller';

@Module({
  controllers: [CompanyReviewsController, CompanyReviewsMutationController],
  providers: [CompanyReviewsService],
})
export class CompanyReviewsModule {}
