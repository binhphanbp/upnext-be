import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, PaymentMethod } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaymentConfigService } from './payment-config.service';
import { SepayWebhookService } from './sepay-webhook.service';
import { SepayPollingService } from './sepay-polling.service';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { SimulateSepayPaymentDto } from './dto/simulate-sepay-payment.dto';
import { SepayWebhookPayload } from './dto/sepay-webhook-payload.dto';

@ApiTags('Payment Config')
@Controller('payments/config')
export class PaymentConfigController {
  constructor(
    private readonly paymentConfigService: PaymentConfigService,
    private readonly sepayWebhookService: SepayWebhookService,
    private readonly sepayPollingService: SepayPollingService,
    private readonly prisma: PrismaService,
  ) {}

  @ApiOperation({
    summary: 'Cấu hình cổng thanh toán SePay hiện tại cho recruiter checkout (không cần đăng nhập)',
  })
  @Get('sepay/public')
  getPublicSepayConfig() {
    return this.paymentConfigService.getPublicSepayConfig();
  }

  @ApiOperation({ summary: 'Kiểm tra kết nối SePay API Token (Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Get('sepay/test-connection')
  testConnection(@Query('token') token?: string) {
    return this.sepayPollingService.testConnection(token);
  }

  @ApiOperation({
    summary: 'Mô phỏng webhook SePay giao dịch vào (Sandbox / Test Mode - Admin)',
    description:
      'Tạo payload mô phỏng giống SePay webhook và chuyển tiếp vào bộ xử lý webhook để kích hoạt hóa đơn.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Post('sepay/simulate')
  async simulatePayment(@Body() dto: SimulateSepayPaymentDto) {
    const config = await this.prisma.paymentGatewayConfig.findUnique({
      where: { provider: PaymentMethod.SEPAY },
    });
    const prefix = config?.contentPrefix ?? '';
    const cleanPrefix = prefix ? `${prefix} ` : '';
    const transferContent = dto.customContent || `${cleanPrefix}${dto.invoiceCode}`;

    let amount = dto.amount;
    if (!amount) {
      const cleanCode = dto.invoiceCode.replace(/[^a-zA-Z0-9]/g, '');
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          invoiceCode: {
            contains: cleanCode,
            mode: 'insensitive',
          },
        },
      });
      amount = invoice ? Number(invoice.amount) : 50000;
    }

    const payload: SepayWebhookPayload = {
      id: Math.floor(Math.random() * 9000000) + 1000000,
      gateway: config?.bankName || 'MBBank Sandbox',
      transactionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      accountNumber: config?.accountNumber || '0123456789',
      subAccount: null,
      code: dto.invoiceCode,
      content: transferContent,
      transferType: 'in',
      description: 'Mô phỏng giao dịch Sandbox SePay',
      transferAmount: amount,
      referenceCode: `SB${Date.now()}`,
      accumulated: 10000000,
    };

    const webhookResult = await this.sepayWebhookService.handle(payload);
    return {
      success: true,
      simulatedPayload: payload,
      webhookResult,
    };
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

