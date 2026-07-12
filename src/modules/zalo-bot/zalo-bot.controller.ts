import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZaloWebhookPayload } from './dto/zalo-webhook-payload.dto';
import { ZaloBotService } from './zalo-bot.service';

@ApiTags('Zalo Bot')
@Controller('zalo-bot')
export class ZaloBotController {
  private readonly logger = new Logger(ZaloBotController.name);

  constructor(private readonly zaloBotService: ZaloBotService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER)
  @ApiOkResponse({ description: 'Trạng thái liên kết Zalo của tài khoản hiện tại' })
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.zaloBotService.getStatus(user);
  }

  @Post('link-code')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER)
  @ApiOkResponse({ description: 'Tạo mã liên kết Zalo mới, gửi mã này cho Bot trên Zalo' })
  createLinkCode(@CurrentUser() user: AuthenticatedUser) {
    return this.zaloBotService.createLinkCode(user);
  }

  @Delete('link')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER)
  async unlink(@CurrentUser() user: AuthenticatedUser) {
    await this.zaloBotService.unlink(user);
  }

  /**
   * Called by Zalo's servers, not by our own clients — authenticated via the
   * shared secret_token registered through setWebhook, not JWT.
   */
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Headers('x-bot-api-secret-token') secretToken: string | undefined,
    @Body() payload: ZaloWebhookPayload,
  ) {
    if (!this.zaloBotService.verifyWebhookSecret(secretToken)) {
      throw new UnauthorizedException('Invalid webhook secret token');
    }

    const message = payload.result?.message;
    const eventName = payload.result?.event_name;

    if (eventName === 'message.text.received' && message?.chat?.id && message.text) {
      this.zaloBotService
        .handleIncomingMessage(message.chat.id, message.text)
        .catch((error) =>
          this.logger.warn(`Failed to process Zalo webhook message: ${error?.message ?? error}`),
        );
    }

    return { ok: true };
  }
}
