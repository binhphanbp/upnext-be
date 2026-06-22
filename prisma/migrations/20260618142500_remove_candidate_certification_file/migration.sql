ALTER TABLE "candidate_certifications"
DROP CONSTRAINT IF EXISTS "candidate_certifications_certificate_file_id_fkey";

ALTER TABLE "candidate_certifications"
DROP COLUMN IF EXISTS "certificate_file_id";
