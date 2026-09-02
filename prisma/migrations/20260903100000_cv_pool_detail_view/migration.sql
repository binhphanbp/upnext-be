-- Kho CV v2: lượt "xem chi tiết" theo chu kỳ tháng, thay cho unlock vĩnh viễn.
--
-- Khác `cv_pool_unlocks` (mở một lần, xem lại mãi mãi -- route đã khai tử),
-- bảng này khoá theo (company_id, candidate_profile_id, period_start): xem lại
-- trong CÙNG kỳ không trừ thêm, sang kỳ mới thì trừ lại. `cv_pool_unlocks`
-- được GIỮ NGUYÊN, không xoá, cho lịch sử/audit của luồng cũ.
CREATE TABLE "cv_pool_detail_views" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "viewed_by_recruiter_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_pool_detail_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cv_pool_detail_views_company_id_candidate_profile_id_peri_key"
    ON "cv_pool_detail_views"("company_id", "candidate_profile_id", "period_start");

CREATE INDEX "cv_pool_detail_views_candidate_profile_id_created_at_idx"
    ON "cv_pool_detail_views"("candidate_profile_id", "created_at");

ALTER TABLE "cv_pool_detail_views"
    ADD CONSTRAINT "cv_pool_detail_views_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cv_pool_detail_views"
    ADD CONSTRAINT "cv_pool_detail_views_candidate_profile_id_fkey"
    FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cv_pool_detail_views"
    ADD CONSTRAINT "cv_pool_detail_views_viewed_by_recruiter_id_fkey"
    FOREIGN KEY ("viewed_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
