import { Module } from '@nestjs/common';
import { CvsModule } from '../cvs/cvs.module';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CvScreeningController } from './cv-screening.controller';
import { CvScreeningService } from './cv-screening.service';
import { CvScreeningWorkerService } from './cv-screening-worker.service';
import { EmbeddingService } from './embedding.service';
import { GeminiScoringService } from './gemini-scoring.service';

@Module({
  imports: [AiModule, CvsModule, SubscriptionsModule],
  controllers: [CvScreeningController],
  providers: [CvScreeningService, CvScreeningWorkerService, EmbeddingService, GeminiScoringService],
  exports: [CvScreeningService, EmbeddingService],
})
export class CvScreeningModule {}
