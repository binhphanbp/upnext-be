import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PaymentMethod } from '@prisma/client';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentConfigService } from './payment-config.service';
import { SepayWebhookPayload } from './dto/sepay-webhook-payload.dto';

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

  async verifyApiKey(authorizationHeader: string | undefined): Promise<void> {
    const expectedKey = await this.paymentConfigService.getWebhookApiKey(PaymentMethod.SEPAY);
    if (!expectedKey) {
      throw new UnauthorizedException('SePay is not configured');
    }

    const expected = `Apikey ${expectedKey}`;
    const provided = authorizationHeader ?? '';

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    const matches =
      expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

    if (!matches) {
      throw new UnauthorizedException('Invalid webhook API key');
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
