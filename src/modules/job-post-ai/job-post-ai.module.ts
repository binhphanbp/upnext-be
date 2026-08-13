import { Module } from '@nestjs/common';
import { CvScreeningModule } from '../cv-screening/cv-screening.module';
import { GeminiJobPostService } from './gemini-job-post.service';
import { GeminiSalaryResearchService } from './gemini-salary-research.service';
import { JobPostAiController } from './job-post-ai.controller';
import { JobPostAiService } from './job-post-ai.service';
import { JobPostSalaryInsightService } from './job-post-salary-insight.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AiModule } from '../ai/ai.module';
import { ConfigService } from '@nestjs/config';
import { FallbackJobPostExtractionAdapter } from './adapters/fallback-job-post-extraction.adapter';
import { GeminiJobPostExtractionAdapter } from './adapters/gemini-job-post-extraction.adapter';
import { HttpJobPostExtractionAdapter } from './adapters/http-job-post-extraction.adapter';
import {
  JOB_POST_EXTRACTION_PROVIDER,
  JobPostExtractionProviderPort,
} from './ports/job-post-extraction-provider.port';

@Module({
  imports: [AiModule, CvScreeningModule, SubscriptionsModule],
  controllers: [JobPostAiController],
  providers: [
    GeminiJobPostExtractionAdapter,
    HttpJobPostExtractionAdapter,
    {
      provide: JOB_POST_EXTRACTION_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpJobPostExtractionAdapter,
        geminiAdapter: GeminiJobPostExtractionAdapter,
      ): JobPostExtractionProviderPort => {
        if (configService.get<string>('aiJobPostExtractionProvider') !== 'upnext-ai') {
          return geminiAdapter;
        }
        if (configService.get<boolean>('aiJobPostExtractionFallbackToGemini') === false) {
          return httpAdapter;
        }
        return new FallbackJobPostExtractionAdapter(httpAdapter, geminiAdapter);
      },
      inject: [ConfigService, HttpJobPostExtractionAdapter, GeminiJobPostExtractionAdapter],
    },
    GeminiJobPostService,
    GeminiSalaryResearchService,
    JobPostAiService,
    JobPostSalaryInsightService,
  ],
})
export class JobPostAiModule {}
