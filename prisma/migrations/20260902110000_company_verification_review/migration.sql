-- Ảnh minh chứng Admin gửi kèm khi từ chối xác thực doanh nghiệp cần một purpose riêng
-- để không lẫn với giấy phép do chính doanh nghiệp tải lên (BUSINESS_LICENSE).
ALTER TYPE "FilePurpose" ADD VALUE IF NOT EXISTS 'company_verification_evidence';

-- Lịch sử quyết định duyệt / từ chối xác thực. Trước đây chỉ có `company_reputation_activities`
-- giữ lý do dưới dạng một dòng điểm uy tín, không lưu được hướng dẫn cụ thể lẫn ảnh minh chứng.
CREATE TABLE IF NOT EXISTS "company_verification_reviews" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "reviewed_by_admin_id" UUID,
    "decision" "CompanyVerificationStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "guidance" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_verification_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "company_verification_reviews_company_id_created_at_idx"
    ON "company_verification_reviews"("company_id", "created_at");

ALTER TABLE "company_verification_reviews" DROP CONSTRAINT IF EXISTS "company_verification_reviews_company_id_fkey";
ALTER TABLE "company_verification_reviews" ADD CONSTRAINT "company_verification_reviews_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_verification_reviews" DROP CONSTRAINT IF EXISTS "company_verification_reviews_reviewed_by_admin_id_fkey";
ALTER TABLE "company_verification_reviews" ADD CONSTRAINT "company_verification_reviews_reviewed_by_admin_id_fkey"
    FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "company_verification_evidences" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "company_verification_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_verification_evidences_review_id_file_id_key"
    ON "company_verification_evidences"("review_id", "file_id");

CREATE INDEX IF NOT EXISTS "company_verification_evidences_review_id_position_idx"
    ON "company_verification_evidences"("review_id", "position");

ALTER TABLE "company_verification_evidences" DROP CONSTRAINT IF EXISTS "company_verification_evidences_review_id_fkey";
ALTER TABLE "company_verification_evidences" ADD CONSTRAINT "company_verification_evidences_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "company_verification_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_verification_evidences" DROP CONSTRAINT IF EXISTS "company_verification_evidences_file_id_fkey";
ALTER TABLE "company_verification_evidences" ADD CONSTRAINT "company_verification_evidences_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
