import { Module } from '@nestjs/common';
import { CvsModule } from '../cvs/cvs.module';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CvScreeningConfigController } from './cv-screening-config.controller';
import { CvScreeningConfigService } from './cv-screening-config.service';
import { CvScreeningController } from './cv-screening.controller';
import { CvScreeningService } from './cv-screening.service';
import { CvScreeningWorkerService } from './cv-screening-worker.service';
import { EmbeddingService } from './embedding.service';
import { GeminiScoringService } from './gemini-scoring.service';

@Module({
  imports: [AiModule, CvsModule, SubscriptionsModule],
  controllers: [CvScreeningController, CvScreeningConfigController],
  providers: [
    CvScreeningService,
    CvScreeningWorkerService,
    CvScreeningConfigService,
    EmbeddingService,
    GeminiScoringService,
  ],
  exports: [CvScreeningService, CvScreeningConfigService, EmbeddingService],
})
export class CvScreeningModule {}
