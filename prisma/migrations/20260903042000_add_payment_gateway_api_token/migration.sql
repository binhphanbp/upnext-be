-- AlterTable
ALTER TABLE "payment_gateway_configs" ADD COLUMN IF NOT EXISTS "api_token" VARCHAR(255);
