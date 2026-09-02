import { Module } from '@nestjs/common';
import { CvScreeningModule } from '../cv-screening/cv-screening.module';
import { EmailService } from '../../common/email/email.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CvPoolAiSearchService } from './cv-pool-ai-search.service';
import { TalentPoolController } from './talent-pool.controller';
import { TalentPoolService } from './talent-pool.service';

/**
 * `CvScreeningModule` được import để lấy `EmbeddingService` --
 * `CvPoolAiSearchService` tái dùng `getOrCreateJobEmbedding()` +
 * `rankCvEmbeddings()` của nó thay vì dựng lại pipeline embedding cho AI lọc
 * Kho CV. Xem doc comment của `CvPoolAiSearchService` cho lý do không tái dùng
 * bucket quota `AI_CV_MATCHING`.
 */
@Module({
  imports: [SubscriptionsModule, CvScreeningModule],
  controllers: [TalentPoolController],
  providers: [TalentPoolService, CvPoolAiSearchService, EmailService],
})
export class TalentPoolModule {}
