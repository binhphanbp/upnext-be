import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { ApplicationAssignmentService } from './application-assignment.service';
import { ApplicationTransitionPolicy } from './application-transition.policy';

import { EmailService } from '../../common/email/email.service';

@Module({
  imports: [ConversationsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationAssignmentService, ApplicationTransitionPolicy, EmailService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
