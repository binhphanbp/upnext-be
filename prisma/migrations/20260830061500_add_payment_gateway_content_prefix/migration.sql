-- Optional prefix required in the bank transfer content before the invoice
-- code, for setups using SePay's Virtual Account (VA) feature (e.g. "TKPUPN").
ALTER TABLE "payment_gateway_configs" ADD COLUMN "content_prefix" VARCHAR(20);
