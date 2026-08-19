import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { EmailService } from '../../common/email/email.service';

@Module({
  imports: [NotificationsModule, ConversationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, EmailService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
