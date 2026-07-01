-- AlterTable
ALTER TABLE "recruiter_accounts" ALTER COLUMN "password_hash" DROP NOT NULL,
ADD COLUMN     "auth_provider" "AuthProvider" NOT NULL DEFAULT 'default',
ADD COLUMN     "provider_user_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_accounts_auth_provider_provider_user_id_key" ON "recruiter_accounts"("auth_provider", "provider_user_id");
