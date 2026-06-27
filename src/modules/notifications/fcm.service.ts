import { Injectable, Inject, Logger } from '@nestjs/common';
import { App } from 'firebase-admin/app';
import { getMessaging, Message, MulticastMessage, BatchResponse } from 'firebase-admin/messaging';
import { ActorType } from '@prisma/client';
import { FIREBASE_ADMIN } from './firebase-admin.provider';
import { NotificationTokenService } from './notification-token.service';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: App,
    private readonly tokenService: NotificationTokenService,
  ) {}

  private getMessagingInstance() {
    if (
      !this.firebaseAdmin ||
      !this.firebaseAdmin.options ||
      Object.keys(this.firebaseAdmin.options).length === 0
    ) {
      return null;
    }
    try {
      return getMessaging(this.firebaseAdmin);
    } catch {
      return null;
    }
  }

  /**
   * Sends a push notification to a single device.
   * Cleans up the registration token if Firebase returns an invalid/expired token error.
   */
  async sendPushNotification(
    token: string,
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        this.logger.warn(
          `Skipping sending push notification to token ${token} (Firebase is not initialized/mocked)`,
        );
        return 'mock-message-id';
      }
      const message: Message = {
        token,
        notification,
        data,
      };

      const response = await messaging.send(message);
      this.logger.debug(`Successfully sent notification to token ${token}: ${response}`);
      return response;
    } catch (error: any) {
      this.logger.error(`Error sending push notification to token ${token}`, error);

      // Clean up invalid or expired token
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        this.logger.warn(`Removing invalid FCM token: ${token}`);
        await this.tokenService.unregisterToken(token);
      }
      throw error;
    }
  }

  /**
   * Sends a multicast push notification to multiple devices.
   * Processes the responses and automatically removes invalid/expired tokens.
   */
  async sendMulticastNotification(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    if (!tokens || tokens.length === 0) {
      return null;
    }

    const message: MulticastMessage = {
      tokens,
      notification,
      data,
    };

    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        this.logger.warn(
          `Skipping sending multicast notification (Firebase is not initialized/mocked)`,
        );
        return {
          responses: tokens.map(() => ({ success: true })),
          successCount: tokens.length,
          failureCount: 0,
        } as any;
      }
      const response: BatchResponse = await messaging.sendEachForMulticast(message);
      this.logger.log(
        `Multicast sent. Success count: ${response.successCount}, Failure count: ${response.failureCount}`,
      );

      if (response.failureCount > 0) {
        const tokensToRemove: string[] = [];

        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const errCode = resp.error.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(tokens[index]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          this.logger.warn(`Removing ${tokensToRemove.length} invalid FCM tokens from database`);
          await Promise.all(tokensToRemove.map((t) => this.tokenService.unregisterToken(t)));
        }
      }

      return response;
    } catch (error) {
      this.logger.error('Error sending multicast push notification', error);
      throw error;
    }
  }

  /**
   * Helper method to send a push notification to all active devices of a specific user.
   */
  async sendNotificationToUser(
    userId: string,
    userRole: ActorType,
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    const tokens = await this.tokenService.getTokensByUser(userId, userRole);

    if (tokens.length === 0) {
      this.logger.log(`No active FCM tokens found for user ID: ${userId} (${userRole})`);
      return null;
    }

    return this.sendMulticastNotification(tokens, notification, data);
  }
}
