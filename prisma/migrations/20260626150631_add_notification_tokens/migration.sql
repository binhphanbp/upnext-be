-- CreateTable
CREATE TABLE "notification_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "device_type" VARCHAR(50),
    "candidate_account_id" UUID,
    "recruiter_account_id" UUID,
    "admin_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_tokens_token_key" ON "notification_tokens"("token");

-- CreateIndex
CREATE INDEX "notification_tokens_candidate_account_id_idx" ON "notification_tokens"("candidate_account_id");

-- CreateIndex
CREATE INDEX "notification_tokens_recruiter_account_id_idx" ON "notification_tokens"("recruiter_account_id");

-- CreateIndex
CREATE INDEX "notification_tokens_admin_user_id_idx" ON "notification_tokens"("admin_user_id");

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_candidate_account_id_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
