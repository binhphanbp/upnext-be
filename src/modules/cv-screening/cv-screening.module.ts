import { Module } from '@nestjs/common';
import { CvsModule } from '../cvs/cvs.module';
import { CvScreeningController } from './cv-screening.controller';
import { CvScreeningService } from './cv-screening.service';
import { EmbeddingService } from './embedding.service';
import { GeminiScoringService } from './gemini-scoring.service';

@Module({
  imports: [CvsModule],
  controllers: [CvScreeningController],
  providers: [CvScreeningService, EmbeddingService, GeminiScoringService],
  exports: [CvScreeningService, EmbeddingService],
})
export class CvScreeningModule {}
