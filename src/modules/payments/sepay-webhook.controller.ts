import { Body, Controller, HttpCode, HttpStatus, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { SepayWebhookService } from './sepay-webhook.service';
import { SepayPollingService } from './sepay-polling.service';
import { SepayWebhookPayload } from './dto/sepay-webhook-payload.dto';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Public endpoint SePay itself calls -- there is no recruiter/admin JWT to
 * check here, only the HMAC-SHA256 signature SePay sends on every call
 * (`X-SePay-Signature` + `X-SePay-Timestamp`), keyed with the secret
 * configured in the admin "Cấu hình thanh toán" page. Excluded from Swagger:
 * it's not part of the app's own API surface for API consumers, it's a
 * third-party callback.
 */
@ApiExcludeController()
@Controller('payments/sepay')
export class SepayWebhookController {
  constructor(
    private readonly sepayWebhookService: SepayWebhookService,
    private readonly sepayPollingService: SepayPollingService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest,
    @Headers('x-sepay-signature') signatureHeader: string | undefined,
    @Headers('x-sepay-timestamp') timestampHeader: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: SepayWebhookPayload,
  ) {
    await this.sepayWebhookService.verifySignature(
      req.rawBody ?? Buffer.alloc(0),
      signatureHeader,
      timestampHeader,
      authHeader,
    );
    const result = await this.sepayWebhookService.handle(payload);
    // Always 200 once the signature checks out -- SePay retries a webhook
    // call that doesn't come back 2xx, and "invoice not found"/"amount
    // mismatch" are things to investigate from logs, not reasons to make
    // SePay hammer the endpoint forever.
    return { success: true, ...result };
  }

  /**
   * Check if an invoice has been paid by querying SePay API transactions directly (polling).
   * Works on localhost without webhooks or ngrok!
   */
  @Post('check/:invoiceId')
  @HttpCode(HttpStatus.OK)
  async checkPayment(@Param('invoiceId') invoiceId: string) {
    return this.sepayPollingService.checkInvoicePayment(invoiceId);
  }
}

