import { Module } from '@nestjs/common';
import { RecruiterAnalyticsController } from './recruiter-analytics.controller';
import { RecruiterAnalyticsService } from './recruiter-analytics.service';

@Module({
  controllers: [RecruiterAnalyticsController],
  providers: [RecruiterAnalyticsService],
})
export class RecruiterAnalyticsModule {}
