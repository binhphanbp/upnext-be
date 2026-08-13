import { Module } from '@nestjs/common';
import { CvScreeningModule } from '../cv-screening/cv-screening.module';
import { GeminiJobPostService } from './gemini-job-post.service';
import { GeminiSalaryResearchService } from './gemini-salary-research.service';
import { JobPostAiController } from './job-post-ai.controller';
import { JobPostAiService } from './job-post-ai.service';
import { JobPostSalaryInsightService } from './job-post-salary-insight.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule, CvScreeningModule, SubscriptionsModule],
  controllers: [JobPostAiController],
  providers: [
    GeminiJobPostService,
    GeminiSalaryResearchService,
    JobPostAiService,
    JobPostSalaryInsightService,
  ],
})
export class JobPostAiModule {}
