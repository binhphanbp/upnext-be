-- AlterTable
ALTER TABLE "cv_screening_company_configs" DROP COLUMN "custom_instructions",
ADD COLUMN     "experience_instructions" TEXT,
ADD COLUMN     "ignore_education_requirement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projects_instructions" TEXT,
ADD COLUMN     "skills_instructions" TEXT;
