-- AlterTable
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "admin_note" TEXT,
ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelled_reason" TEXT,
ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "refund_reason" TEXT,
ADD COLUMN IF NOT EXISTS "refund_reference" VARCHAR(120);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_payment_status_created_at_idx" ON "invoices"("payment_status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_created_at_idx" ON "invoices"("created_at");
