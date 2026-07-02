-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "benefits" TEXT;

-- AlterTable
ALTER TABLE "job_locations" ADD COLUMN IF NOT EXISTS "company_id" UUID,
ADD COLUMN IF NOT EXISTS "name" VARCHAR(100);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'job_locations_company_id_fkey' 
          AND table_name = 'job_locations'
    ) THEN
        ALTER TABLE "job_locations" 
        ADD CONSTRAINT "job_locations_company_id_fkey" 
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
