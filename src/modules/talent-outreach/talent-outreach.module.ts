import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { CvScreeningModule } from '../cv-screening/cv-screening.module';
import { TalentContactService } from './talent-contact.service';
import { TalentOutreachController } from './talent-outreach.controller';
import { TalentRecommendationService } from './talent-recommendation.service';

@Module({
  imports: [ConversationsModule, CvScreeningModule],
  controllers: [TalentOutreachController],
  providers: [TalentContactService, TalentRecommendationService],
})
export class TalentOutreachModule {}
