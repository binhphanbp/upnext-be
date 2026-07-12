import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SaveFcmTokenDto } from './dto/save-fcm-token.dto';
import { NotificationTokenService } from './notification-token.service';
import { FcmService } from './fcm.service';

@ApiTags('Notifications')
@Controller('notifications/tokens')
export class NotificationTokenController {
  constructor(
    private readonly tokenService: NotificationTokenService,
    private readonly fcmService: FcmService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or update FCM device token for the current user' })
  @ApiResponse({ status: 200, description: 'Token registered successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async registerToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveFcmTokenDto) {
    return this.tokenService.registerToken(user.id, user.role, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unregister/remove FCM device token (e.g. on logout)' })
  @ApiResponse({ status: 200, description: 'Token unregistered successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async unregisterToken(@Body('token') token: string) {
    await this.tokenService.unregisterToken(token);
    return { message: 'Token unregistered successfully' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Post('test-send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a test push notification to a specific token (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Test notification sent.' })
  async sendTestNotification(
    @Body('token') token: string,
    @Body('title') title?: string,
    @Body('body') body?: string,
  ) {
    try {
      const result = await this.fcmService.sendPushNotification(
        token,
        {
          title: title || 'Test Notification',
          body: body || 'Hello! This is a test notification from UpNext backend.',
        },
        {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          timestamp: new Date().toISOString(),
        },
      );
      return { success: true, messageId: result };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      };
    }
  }
}
