import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { CompanyReviewsService } from './company-reviews.service';
import {
  CompanyReviewsController,
  CompanyReviewsMutationController,
} from './company-reviews.controller';

@Module({
  // Recruiter reports are written to the shared reports table; admins moderate them
  // from the single /admin/reports queue rather than a screen of their own.
  imports: [ReportsModule],
  controllers: [CompanyReviewsController, CompanyReviewsMutationController],
  providers: [CompanyReviewsService],
})
export class CompanyReviewsModule {}
