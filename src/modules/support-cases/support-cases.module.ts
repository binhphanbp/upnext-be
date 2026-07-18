import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { AdminSupportController } from './admin-support.controller';
import { RecruiterSupportController } from './recruiter-support.controller';
import { SupportCaseService } from './support-case.service';
import { SupportRoutingPolicy } from './support-routing.policy';

@Module({
  imports: [ConversationsModule],
  controllers: [RecruiterSupportController, AdminSupportController],
  providers: [SupportCaseService, SupportRoutingPolicy],
})
export class SupportCasesModule {}
