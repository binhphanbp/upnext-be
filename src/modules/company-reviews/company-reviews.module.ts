import { Module } from '@nestjs/common';
import { CompanyReviewsService } from './company-reviews.service';
import { CompanyReviewsController } from './company-reviews.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [CompanyReviewsController],
  providers: [CompanyReviewsService, PrismaService],
})
export class CompanyReviewsModule {}
