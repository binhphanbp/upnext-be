import { Module } from '@nestjs/common';
import { AdminCompanyReviewReportsController } from './admin-company-review-reports.controller';
import { CompanyReviewsService } from './company-reviews.service';
import {
  CompanyReviewsController,
  CompanyReviewsMutationController,
} from './company-reviews.controller';

@Module({
  controllers: [
    CompanyReviewsController,
    CompanyReviewsMutationController,
    AdminCompanyReviewReportsController,
  ],
  providers: [CompanyReviewsService],
})
export class CompanyReviewsModule {}
