import { Body, Controller, HttpCode, HttpStatus, Headers, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SepayWebhookService } from './sepay-webhook.service';
import { SepayWebhookPayload } from './dto/sepay-webhook-payload.dto';

/**
 * Public endpoint SePay itself calls -- there is no recruiter/admin JWT to
 * check here, only the `Authorization: Apikey <key>` header SePay echoes
 * back on every call, matched against the key configured in the admin
 * "Cấu hình thanh toán" page. Excluded from Swagger: it's not part of the
 * app's own API surface for API consumers, it's a third-party callback.
 */
@ApiExcludeController()
@Controller('payments/sepay')
export class SepayWebhookController {
  constructor(private readonly sepayWebhookService: SepayWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() payload: SepayWebhookPayload,
  ) {
    await this.sepayWebhookService.verifyApiKey(authorizationHeader);
    const result = await this.sepayWebhookService.handle(payload);
    // Always 200 once the API key checks out -- SePay retries a webhook call
    // that doesn't come back 2xx, and "invoice not found"/"amount mismatch"
    // are things to investigate from logs, not reasons to make SePay hammer
    // the endpoint forever.
    return { success: true, ...result };
  }
}
