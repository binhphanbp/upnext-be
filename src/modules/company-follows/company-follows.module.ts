import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CompanyFollowAlertsService } from './company-follow-alerts.service';
import { CompanyFollowsService } from './company-follows.service';
import { CompanyFollowsController } from './company-follows.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [CompanyFollowsController],
  providers: [CompanyFollowsService, CompanyFollowAlertsService, EmailService],
})
export class CompanyFollowsModule {}
