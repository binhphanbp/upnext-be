import { Injectable, Logger } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveFcmTokenDto } from './dto/save-fcm-token.dto';

@Injectable()
export class NotificationTokenService {
  private readonly logger = new Logger(NotificationTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers or updates an FCM token for a user.
   * If the token already exists, it maps the token to the current active user account and updates its details.
   */
  async registerToken(userId: string, role: ActorType, dto: SaveFcmTokenDto) {
    this.logger.log(`Registering FCM token for user ${userId} with role ${role}`);

    const data = {
      token: dto.token,
      deviceType: dto.deviceType || null,
      candidateAccountId: role === ActorType.CANDIDATE ? userId : null,
      recruiterAccountId: role === ActorType.RECRUITER ? userId : null,
      adminUserId: role === ActorType.ADMIN ? userId : null,
    };

    return this.prisma.notificationToken.upsert({
      where: { token: dto.token },
      create: data,
      update: data,
    });
  }

  /**
   * Unregisters/removes an FCM token from the database.
   * This is typically called during logout or when a token is invalidated by Firebase.
   */
  async unregisterToken(token: string) {
    this.logger.log(`Unregistering FCM token`);
    return this.prisma.notificationToken.deleteMany({
      where: { token },
    });
  }

  /**
   * Returns a list of all active FCM tokens registered for a specific user ID and role.
   */
  async getTokensByUser(userId: string, role: ActorType): Promise<string[]> {
    let whereClause: Record<string, string>;

    if (role === ActorType.CANDIDATE) {
      whereClause = { candidateAccountId: userId };
    } else if (role === ActorType.RECRUITER) {
      whereClause = { recruiterAccountId: userId };
    } else if (role === ActorType.ADMIN) {
      whereClause = { adminUserId: userId };
    } else {
      return [];
    }

    const tokens = await this.prisma.notificationToken.findMany({
      where: whereClause,
      select: { token: true },
    });

    return tokens.map((t) => t.token);
  }
}
