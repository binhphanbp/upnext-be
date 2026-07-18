import { Module } from '@nestjs/common';
import { ConversationGateway } from './conversation.gateway';
import { ConversationsController } from './conversations.controller';
import { ConversationExpirationService } from './services/conversation-expiration.service';
import { ConversationLifecycleService } from './services/conversation-lifecycle.service';
import { ConversationPolicyService } from './services/conversation-policy.service';
import { ConversationRealtimeService } from './services/conversation-realtime.service';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { MessageAttachmentService } from './services/message-attachment.service';

@Module({
  controllers: [ConversationsController],
  providers: [
    ConversationGateway,
    ConversationService,
    ConversationPolicyService,
    ConversationLifecycleService,
    ConversationRealtimeService,
    ConversationExpirationService,
    MessageService,
    MessageAttachmentService,
  ],
  exports: [
    ConversationLifecycleService,
    ConversationPolicyService,
    ConversationRealtimeService,
    MessageService,
  ],
})
export class ConversationsModule {}
