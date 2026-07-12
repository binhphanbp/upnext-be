-- AlterTable
ALTER TABLE "candidate_accounts" ADD COLUMN     "zalo_chat_id" VARCHAR(100),
ADD COLUMN     "zalo_link_code" VARCHAR(20);

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "recruiter_accounts" ADD COLUMN     "zalo_chat_id" VARCHAR(100),
ADD COLUMN     "zalo_link_code" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_accounts_zalo_chat_id_key" ON "candidate_accounts"("zalo_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_accounts_zalo_link_code_key" ON "candidate_accounts"("zalo_link_code");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_accounts_zalo_chat_id_key" ON "recruiter_accounts"("zalo_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_accounts_zalo_link_code_key" ON "recruiter_accounts"("zalo_link_code");
