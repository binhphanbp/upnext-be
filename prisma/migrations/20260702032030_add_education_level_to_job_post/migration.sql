-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('any', 'high_school', 'vocational', 'college', 'bachelor', 'postgraduate');

-- AlterTable
ALTER TABLE "job_posts" ADD COLUMN     "education_level" "EducationLevel" NOT NULL DEFAULT 'any';
