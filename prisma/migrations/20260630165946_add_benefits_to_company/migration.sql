-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "benefits" TEXT;

-- AlterTable
ALTER TABLE "job_locations" ADD COLUMN     "company_id" UUID,
ADD COLUMN     "name" VARCHAR(100);

-- AddForeignKey
ALTER TABLE "job_locations" ADD CONSTRAINT "job_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
