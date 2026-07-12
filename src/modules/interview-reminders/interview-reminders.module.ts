import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ZaloBotModule } from '../zalo-bot/zalo-bot.module';
import { InterviewRemindersService } from './interview-reminders.service';

@Module({
  imports: [NotificationsModule, ZaloBotModule],
  providers: [InterviewRemindersService, EmailService],
})
export class InterviewRemindersModule {}
