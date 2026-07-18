import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [OutboxService, OutboxProcessorService],
  exports: [OutboxService],
})
export class OutboxModule {}
