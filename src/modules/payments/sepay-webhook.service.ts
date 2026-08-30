import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentConfigService } from './payment-config.service';
import { SepayWebhookPayload } from './dto/sepay-webhook-payload.dto';

// SePay retries a webhook it thinks failed; without a bound on how old a
// signed timestamp can be, a captured request replays successfully forever.
// 5 minutes matches SePay's own documented tolerance
// (https://developer.sepay.vn/en/sepay-webhooks/xac-thuc).
const SIGNATURE_TOLERANCE_SECONDS = 300;

// Banks routinely mangle the transfer content SePay reports in `content`:
// hyphens/spaces get dropped, extra bank boilerplate gets prepended or
// appended. Match "INV" + 8 digits (date) + 4 digits (random suffix) with
// an optional separator between each group, tolerant of both the clean
// "INV-20260830-6629" form and the flattened "INV202608306629" form.
const INVOICE_CODE_PATTERN = /INV[\s-]?(\d{8})[\s-]?(\d{4})/i;

@Injectable()
export class SepayWebhookService {
  private readonly logger = new Logger(SepayWebhookService.name);

  constructor(
    private readonly paymentConfigService: PaymentConfigService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * Verifies SePay's HMAC-SHA256 webhook signature per
   * https://developer.sepay.vn/en/sepay-webhooks/xac-thuc:
   *   - `X-SePay-Signature: sha256=<hex>` over the literal bytes
   *     `${timestamp}.${raw_body}`, keyed with the configured secret.
   *   - `X-SePay-Timestamp` must be within 5 minutes of "now" (replay
   *     protection) -- a signature never expires on its own otherwise.
   *
   * `rawBody` must be the exact bytes Express received (see the `verify`
   * callback on the global json() parser in main.ts) -- signing is over raw
   * bytes, not a re-serialized `JSON.stringify(parsedBody)`, which can differ
   * in key order/whitespace/unicode escaping and never match.
   */
  async verifySignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
  ): Promise<void> {
    const secret = await this.paymentConfigService.getWebhookSecret(PaymentMethod.SEPAY);
    if (!secret) {
      throw new UnauthorizedException('SePay is not configured');
    }
    if (!signatureHeader || !timestampHeader) {
      throw new UnauthorizedException('Missing SePay signature headers');
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      throw new UnauthorizedException('Invalid SePay timestamp header');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      throw new UnauthorizedException('SePay webhook timestamp outside the allowed window');
    }

    const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf-8'), rawBody]);
    const expectedHex = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const expected = `sha256=${expectedHex}`;

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(signatureHeader);
    const matches =
      expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

    if (!matches) {
      throw new UnauthorizedException('Invalid SePay webhook signature');
    }
  }

  async handle(payload: SepayWebhookPayload): Promise<{ handled: boolean; reason?: string }> {
    if (payload.transferType !== 'in') {
      // Outgoing transfers from our own account are not invoice payments.
      return { handled: true, reason: 'ignored_outgoing_transfer' };
    }

    const content = payload.content ?? payload.description ?? '';
    const match = INVOICE_CODE_PATTERN.exec(content);
    if (!match) {
      this.logger.warn(`SePay webhook: could not find an invoice code in content "${content}"`);
      return { handled: false, reason: 'invoice_code_not_found' };
    }
    const invoiceCode = `INV-${match[1]}-${match[2]}`;

    const transferAmount = Number(payload.transferAmount ?? NaN);
    if (!Number.isFinite(transferAmount)) {
      this.logger.warn(`SePay webhook: missing/invalid transferAmount for ${invoiceCode}`);
      return { handled: false, reason: 'invalid_amount' };
    }

    return this.invoicesService.markPaidByWebhook(
      invoiceCode,
      PaymentMethod.SEPAY,
      payload.referenceCode ?? String(payload.id ?? ''),
      transferAmount,
    );
  }
}
