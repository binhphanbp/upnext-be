-- Điền số Free/Pro thật cho 6 feature key non-AI của Recruiter (D1, mục 14 của
-- KE-HOACH-SUBSCRIPTION-THUC-THI.md). Migration `free_tier_jd_credits` trước đó đặt
-- job_post/hr_seat/talent_contact về "không giới hạn" (limit_value = NULL) làm placeholder
-- tạm; migration này thay bằng số thật đã chốt.
--
-- KHÔNG đổi hình dạng catalog (không tạo RECRUITER_FREE/RECRUITER_PRO, không archive 4
-- gói cũ) -- đó là quyết định cấu trúc D3a riêng, chưa làm ở đây. Chỉ sửa plan_features
-- của 4 gói recruiter đang có: RECRUITER_BASIC nhận số Free, RECRUITER_STANDARD +
-- RECRUITER_PREMIUM cùng nhận số Pro (hai bậc giá cũ gộp về một bậc Pro theo D3a --
-- "2 bậc mỗi audience"). RECRUITER_LEGACY (status=INACTIVE, không bán) không đổi.
--
-- KHÔNG đụng ai_cv_matching/ai_jd_generate -- giá/limit hai key AI này chờ D3b (đo COGS
-- thật), không được thay bằng số phỏng đoán (mục 5.3/14.4).
--
-- KHÔNG seed urgent_label: enum tồn tại trong schema nhưng job-boost.service.ts chỉ
-- bao giờ consume(FEATURED_JOB) cho cả hai loại boost (FEATURED và URGENT dùng chung một
-- hạn mức, theo mục 15.2) -- tạo một plan_features row cho urgent_label sẽ không được
-- code nào đọc, chỉ gây hiểu lầm là có gate riêng.

-- 1. Free (RECRUITER_BASIC): job_post 1, featured_job 0, cv_pool_view 0,
--    talent_contact 0, hr_seat 1.
UPDATE "plan_features" pf
SET "limit_value" = v."limit_value", "enabled" = true
FROM "subscription_plans" p, (VALUES
  ('job_post'::"SubscriptionFeature",       1),
  ('featured_job'::"SubscriptionFeature",   0),
  ('cv_pool_view'::"SubscriptionFeature",   0),
  ('talent_contact'::"SubscriptionFeature", 0),
  ('hr_seat'::"SubscriptionFeature",        1)
) AS v("feature", "limit_value")
WHERE pf."plan_id" = p."id"
  AND p."code" = 'RECRUITER_BASIC'
  AND pf."feature" = v."feature";

-- 2. Pro (RECRUITER_STANDARD, RECRUITER_PREMIUM): job_post 30, featured_job 10,
--    cv_pool_view 500, talent_contact 250, hr_seat 10.
UPDATE "plan_features" pf
SET "limit_value" = v."limit_value", "enabled" = true
FROM "subscription_plans" p, (VALUES
  ('job_post'::"SubscriptionFeature",       30),
  ('featured_job'::"SubscriptionFeature",   10),
  ('cv_pool_view'::"SubscriptionFeature",   500),
  ('talent_contact'::"SubscriptionFeature", 250),
  ('hr_seat'::"SubscriptionFeature",        10)
) AS v("feature", "limit_value")
WHERE pf."plan_id" = p."id"
  AND p."code" IN ('RECRUITER_STANDARD', 'RECRUITER_PREMIUM')
  AND pf."feature" = v."feature";

-- Không cần backfill `subscription_quota_counters`: `SubscriptionQuotaService`
-- (subscription-quota.service.ts) refresh `limit_value` của counter từ `plan_features`
-- ngay trong `getOrCreateCounter()` mỗi lần `consume()` chạy, và `peek()` đọc limit từ
-- `plan_features` trực tiếp, không đọc `limit_value` cũ trên counter -- không có bản ghi
-- nào bị "kẹt" số cũ.
