-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "payment_reference" VARCHAR(120);

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" UUID NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" VARCHAR(120),
    "bank_bin" VARCHAR(20),
    "account_number" VARCHAR(50),
    "account_name" VARCHAR(150),
    "webhook_api_key" VARCHAR(255),
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_provider_key" ON "payment_gateway_configs"("provider");

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
