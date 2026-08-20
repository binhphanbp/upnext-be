-- Kho CV: mở khóa một hồ sơ một lần thì xem lại miễn phí, không trừ `cv_pool_view`
-- thêm lần thứ hai. `@@unique(company_id, candidate_profile_id)` là cơ chế duy nhất cần
-- để tra "công ty này đã mở hồ sơ ứng viên này chưa" trước khi tiêu quota, và cùng bảng
-- này phục vụ luôn câu hỏi "ứng viên xem được ai đã mở hồ sơ mình" (§13.2).
CREATE TABLE "cv_pool_unlocks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "unlocked_by_recruiter_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_pool_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cv_pool_unlocks_company_id_candidate_profile_id_key"
    ON "cv_pool_unlocks"("company_id", "candidate_profile_id");

CREATE INDEX "cv_pool_unlocks_candidate_profile_id_created_at_idx"
    ON "cv_pool_unlocks"("candidate_profile_id", "created_at");

ALTER TABLE "cv_pool_unlocks" ADD CONSTRAINT "cv_pool_unlocks_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cv_pool_unlocks" ADD CONSTRAINT "cv_pool_unlocks_candidate_profile_id_fkey"
    FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cv_pool_unlocks" ADD CONSTRAINT "cv_pool_unlocks_unlocked_by_recruiter_id_fkey"
    FOREIGN KEY ("unlocked_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
