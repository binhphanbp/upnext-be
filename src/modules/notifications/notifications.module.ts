import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FirebaseAdminProvider } from './firebase-admin.provider';
import { NotificationTokenService } from './notification-token.service';
import { FcmService } from './fcm.service';
import { NotificationTokenController } from './notification-token.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationTokenController, NotificationsController],
  providers: [FirebaseAdminProvider, NotificationTokenService, FcmService, NotificationsService],
  exports: [FcmService, NotificationTokenService, NotificationsService],
})
export class NotificationsModule {}
