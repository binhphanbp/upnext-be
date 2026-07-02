-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EducationLevel') THEN
        CREATE TYPE "EducationLevel" AS ENUM ('any', 'high_school', 'vocational', 'college', 'bachelor', 'postgraduate');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN IF NOT EXISTS "education_level" "EducationLevel" NOT NULL DEFAULT 'any';
