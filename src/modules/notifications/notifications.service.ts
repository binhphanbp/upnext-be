import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ActorType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './fcm.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Creates a notification in the database (In-App) and pushes it to devices via FCM.
   */
  async createNotification(params: {
    recipientId: string;
    recipientType: ActorType;
    title: string;
    body: string;
    targetId?: string | null;
    targetType?: string | null;
  }) {
    const { recipientId, recipientType, title, body, targetId, targetType } = params;

    this.logger.log(
      `Creating notification for ${recipientType} ${recipientId}: "${title}"`,
    );

    // 1. Save the notification in the database (IN_APP channel, PENDING status)
    const notification = await this.prisma.notification.create({
      data: {
        recipientId,
        recipientType: recipientType.toString(),
        title,
        type: targetType || 'SYSTEM',
        targetId: targetId || null,
        targetType: targetType || null,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
      },
    });

    // 2. Try sending push notification via FCM in background
    try {
      const fcmResult = await this.fcmService.sendNotificationToUser(
        recipientId,
        recipientType,
        { title, body },
        {
          notificationId: notification.id,
          type: targetType || 'SYSTEM',
          targetId: targetId || '',
        },
      );

      if (fcmResult) {
        // Update notification status to SENT
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
        this.logger.debug(`FCM push sent successfully for notification ${notification.id}`);
      } else {
        this.logger.warn(
          `FCM push skipped for notification ${notification.id} (No tokens found)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send FCM push for notification ${notification.id}`,
        err,
      );
      // Update status to FAILED
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED },
      });
    }

    return notification;
  }

  /**
   * Retrieves paginated notifications for the current user.
   */
  async getNotifications(params: {
    userId: string;
    role: ActorType;
    page: number;
    limit: number;
  }) {
    const { userId, role, page, limit } = params;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          recipientId: userId,
          recipientType: role.toString(),
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where: {
          recipientId: userId,
          recipientType: role.toString(),
        },
      }),
    ]);

    const unreadCount = await this.prisma.notification.count({
      where: {
        recipientId: userId,
        recipientType: role.toString(),
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
        readAt: null,
      },
    });

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(id: string, userId: string, role: ActorType) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (
      notification.recipientId !== userId ||
      notification.recipientType !== role.toString()
    ) {
      throw new ForbiddenException('You do not have permission to access this notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marks all notifications of the current user as read.
   */
  async markAllAsRead(userId: string, role: ActorType) {
    return this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        recipientType: role.toString(),
        readAt: null,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  /**
   * Deletes a notification.
   */
  async deleteNotification(id: string, userId: string, role: ActorType) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (
      notification.recipientId !== userId ||
      notification.recipientType !== role.toString()
    ) {
      throw new ForbiddenException('You do not have permission to delete this notification');
    }

    await this.prisma.notification.delete({
      where: { id },
    });

    return { success: true, message: 'Notification deleted successfully' };
  }
}
