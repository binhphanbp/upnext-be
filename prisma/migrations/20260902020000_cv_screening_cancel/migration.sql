-- AlterEnum
ALTER TYPE "CvScreeningRunStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "cv_screening_runs" ADD COLUMN     "cancel_requested_at" TIMESTAMP(3);
