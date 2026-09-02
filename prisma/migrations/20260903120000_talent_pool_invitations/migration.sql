-- CreateTable
CREATE TABLE "talent_pool_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_pool_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "talent_pool_invitations_company_id_candidate_profile_id_key" ON "talent_pool_invitations"("company_id", "candidate_profile_id");

-- CreateIndex
CREATE INDEX "talent_pool_invitations_company_id_idx" ON "talent_pool_invitations"("company_id");

-- CreateIndex
CREATE INDEX "talent_pool_invitations_candidate_profile_id_idx" ON "talent_pool_invitations"("candidate_profile_id");

-- AddForeignKey
ALTER TABLE "talent_pool_invitations" ADD CONSTRAINT "talent_pool_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_pool_invitations" ADD CONSTRAINT "talent_pool_invitations_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
