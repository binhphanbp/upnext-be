/**
 * Shape SePay actually POSTs to a configured webhook. Not decorated with
 * class-validator: this is an external, third-party payload -- a field
 * SePay adds/renames tomorrow should not 400 the whole webhook, so the
 * service extracts what it needs defensively instead of rejecting on a
 * strict DTO mismatch.
 *
 * https://docs.sepay.vn (Webhooks section) documents this exact field set.
 */
export interface SepayWebhookPayload {
  id?: number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  accumulated?: number;
  subAccount?: string | null;
  referenceCode?: string;
  description?: string;
}
