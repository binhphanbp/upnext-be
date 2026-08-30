-- Rename to reflect what this column actually stores for SePay: a
-- shared HMAC-SHA256 signing secret, not an "API key" used to call an
-- outbound API (SePay only ever calls *us*, on the webhook).
ALTER TABLE "payment_gateway_configs" RENAME COLUMN "webhook_api_key" TO "webhook_secret";
