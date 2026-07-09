CREATE TABLE "recruiter_refresh_tokens" (
    "id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recruiter_refresh_tokens_recruiter_account_id_idx" ON "recruiter_refresh_tokens"("recruiter_account_id");

CREATE INDEX "recruiter_refresh_tokens_expires_at_idx" ON "recruiter_refresh_tokens"("expires_at");

ALTER TABLE "recruiter_refresh_tokens"
ADD CONSTRAINT "recruiter_refresh_tokens_recruiter_account_id_fkey"
FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
