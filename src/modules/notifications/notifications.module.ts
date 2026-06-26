import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FirebaseAdminProvider } from './firebase-admin.provider';
import { NotificationTokenService } from './notification-token.service';
import { FcmService } from './fcm.service';
import { NotificationTokenController } from './notification-token.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationTokenController],
  providers: [FirebaseAdminProvider, NotificationTokenService, FcmService],
  exports: [FcmService, NotificationTokenService],
})
export class NotificationsModule {}
