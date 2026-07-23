-- CreateEnum
CREATE TYPE "JobReputationEvaluationType" AS ENUM ('cv_processing', 'expiry_penalty');

-- AlterEnum
ALTER TYPE "CompanyStatus" ADD VALUE 'restricted';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "restricted_at" TIMESTAMP(3),
ADD COLUMN     "score_before_restriction" DECIMAL(6,2),
ALTER COLUMN "reputation_score" SET DEFAULT 35;

-- AlterTable
ALTER TABLE "post_categories" ADD COLUMN     "parent_id" UUID;

-- CreateTable
CREATE TABLE "tax_code_blacklists" (
    "id" UUID NOT NULL,
    "tax_code" VARCHAR(50) NOT NULL,
    "reason" TEXT NOT NULL,
    "by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_code_blacklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hiring_result_reports" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "total_hired" INTEGER NOT NULL DEFAULT 0,
    "total_applications" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hiring_result_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_reputation_evaluations" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "evaluation_type" "JobReputationEvaluationType" NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_reputation_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_code_blacklists_tax_code_key" ON "tax_code_blacklists"("tax_code");

-- CreateIndex
CREATE UNIQUE INDEX "hiring_result_reports_job_post_id_key" ON "hiring_result_reports"("job_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_reputation_evaluations_job_post_id_evaluation_type_key" ON "job_reputation_evaluations"("job_post_id", "evaluation_type");

-- CreateIndex
CREATE INDEX "post_categories_parent_id_idx" ON "post_categories"("parent_id");

-- AddForeignKey
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_code_blacklists" ADD CONSTRAINT "tax_code_blacklists_by_admin_id_fkey" FOREIGN KEY ("by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_result_reports" ADD CONSTRAINT "hiring_result_reports_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_result_reports" ADD CONSTRAINT "hiring_result_reports_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_reputation_evaluations" ADD CONSTRAINT "job_reputation_evaluations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
