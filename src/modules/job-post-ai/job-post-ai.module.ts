import { Module } from '@nestjs/common';
import { CvScreeningModule } from '../cv-screening/cv-screening.module';
import { GeminiJobPostService } from './gemini-job-post.service';
import { SalaryResearchService } from './salary-research.service';
import { JobPostAiController } from './job-post-ai.controller';
import { JobPostAiService } from './job-post-ai.service';
import { AiOperationCacheService } from './ai-operation-cache.service';
import { JobPostSalaryInsightService } from './job-post-salary-insight.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ConfigService } from '@nestjs/config';
import { FallbackGroundedResearchAdapter } from './adapters/fallback-grounded-research.adapter';
import { FallbackJobPostExtractionAdapter } from './adapters/fallback-job-post-extraction.adapter';
import { FallbackJobPostGenerationAdapter } from './adapters/fallback-job-post-generation.adapter';
import { GeminiGroundedResearchAdapter } from './adapters/gemini-grounded-research.adapter';
import { GeminiJobPostExtractionAdapter } from './adapters/gemini-job-post-extraction.adapter';
import { GeminiJobPostGenerationAdapter } from './adapters/gemini-job-post-generation.adapter';
import { HttpGroundedResearchAdapter } from './adapters/http-grounded-research.adapter';
import { HttpJobPostExtractionAdapter } from './adapters/http-job-post-extraction.adapter';
import { HttpJobPostGenerationAdapter } from './adapters/http-job-post-generation.adapter';
import {
  GROUNDED_RESEARCH_PROVIDER,
  GroundedResearchProviderPort,
} from './ports/grounded-research-provider.port';
import {
  JOB_POST_EXTRACTION_PROVIDER,
  JobPostExtractionProviderPort,
} from './ports/job-post-extraction-provider.port';
import {
  JOB_POST_GENERATION_PROVIDER,
  JobPostGenerationProviderPort,
} from './ports/job-post-generation-provider.port';

@Module({
  imports: [CvScreeningModule, SubscriptionsModule],
  controllers: [JobPostAiController],
  providers: [
    AiOperationCacheService,
    GeminiJobPostExtractionAdapter,
    HttpJobPostExtractionAdapter,
    GeminiJobPostGenerationAdapter,
    HttpJobPostGenerationAdapter,
    GeminiGroundedResearchAdapter,
    HttpGroundedResearchAdapter,
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
    {
      provide: JOB_POST_GENERATION_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpJobPostGenerationAdapter,
        geminiAdapter: GeminiJobPostGenerationAdapter,
      ): JobPostGenerationProviderPort => {
        if (configService.get<string>('aiJobPostGenerationProvider') !== 'upnext-ai') {
          return geminiAdapter;
        }
        if (configService.get<boolean>('aiJobPostGenerationFallbackToGemini') === false) {
          return httpAdapter;
        }
        return new FallbackJobPostGenerationAdapter(httpAdapter, geminiAdapter);
      },
      inject: [ConfigService, HttpJobPostGenerationAdapter, GeminiJobPostGenerationAdapter],
    },
    {
      provide: GROUNDED_RESEARCH_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpGroundedResearchAdapter,
        geminiAdapter: GeminiGroundedResearchAdapter,
      ): GroundedResearchProviderPort => {
        if (configService.get<string>('aiGroundedResearchProvider') !== 'upnext-ai') {
          return geminiAdapter;
        }
        if (configService.get<boolean>('aiGroundedResearchFallbackToGemini') === false) {
          return httpAdapter;
        }
        return new FallbackGroundedResearchAdapter(httpAdapter, geminiAdapter);
      },
      inject: [ConfigService, HttpGroundedResearchAdapter, GeminiGroundedResearchAdapter],
    },
    GeminiJobPostService,
    SalaryResearchService,
    JobPostAiService,
    JobPostSalaryInsightService,
  ],
})
export class JobPostAiModule {}
