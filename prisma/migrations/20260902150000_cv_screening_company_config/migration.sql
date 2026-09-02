-- CreateTable
CREATE TABLE "cv_screening_company_configs" (
    "company_id" UUID NOT NULL,
    "custom_instructions" TEXT,
    "default_top_n" INTEGER,
    "min_similarity_score" INTEGER,
    "updated_by_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_screening_company_configs_pkey" PRIMARY KEY ("company_id")
);

-- AddForeignKey
ALTER TABLE "cv_screening_company_configs" ADD CONSTRAINT "cv_screening_company_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
