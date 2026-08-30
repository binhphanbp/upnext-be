import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, PaymentMethod } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaymentConfigService } from './payment-config.service';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';

@ApiTags('Payment Config')
@Controller('payments/config')
export class PaymentConfigController {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  @ApiOperation({
    summary: 'Cấu hình cổng thanh toán SePay hiện tại cho recruiter checkout (không cần đăng nhập)',
  })
  @Get('sepay/public')
  getPublicSepayConfig() {
    return this.paymentConfigService.getPublicSepayConfig();
  }

  @ApiOperation({ summary: 'Xem cấu hình 1 cổng thanh toán (Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Get(':provider')
  getConfig(@Param('provider', new ParseEnumPipe(PaymentMethod)) provider: PaymentMethod) {
    return this.paymentConfigService.getForAdmin(provider);
  }

  @ApiOperation({
    summary: 'Cập nhật cấu hình 1 cổng thanh toán (Admin)',
    description:
      'Để trống webhookSecret nếu không muốn đổi secret hiện tại -- secret thật không bao giờ được trả về, chỉ trả bản mask.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Put(':provider')
  updateConfig(
    @Param('provider', new ParseEnumPipe(PaymentMethod)) provider: PaymentMethod,
    @Body() dto: UpsertPaymentConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentConfigService.upsert(provider, dto, user.id);
  }
}
