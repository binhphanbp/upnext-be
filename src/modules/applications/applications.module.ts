import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { ApplicationAssignmentService } from './application-assignment.service';
import { ApplicationTransitionPolicy } from './application-transition.policy';

@Module({
  imports: [ConversationsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationAssignmentService, ApplicationTransitionPolicy],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
