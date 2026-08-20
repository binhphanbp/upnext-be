-- D3a (KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 19): gộp 4 gói recruiter về 2 bậc
-- Free/Pro. Phạm vi đã hỏi lại và chốt hẹp: đổi CODE của RECRUITER_BASIC thành
-- RECRUITER_FREE (không tạo plan Free mới); tạo RECRUITER_PRO mới nhưng
-- `is_public = false` (D3b -- đo COGS AI, chốt giá/limit thật -- CHƯA làm, không được
-- công khai gói trả phí trước đó); archive RECRUITER_STANDARD/PREMIUM/LEGACY
-- (`status = archived`, `is_public = false`, không xóa); migrate NGAY các
-- company_subscriptions đang `active` trên STANDARD/PREMIUM sang RECRUITER_PRO --
-- subscription lịch sử (đã EXPIRED/CANCELLED) giữ nguyên plan_id cũ để không viết lại
-- lịch sử.

-- 1. RECRUITER_BASIC -> RECRUITER_FREE. Chỉ đổi mã, không đổi tên hiển thị/mô tả --
--    đó là quyết định copy/marketing riêng, ngoài phạm vi migration này.
UPDATE "subscription_plans"
SET "code" = 'RECRUITER_FREE'
WHERE "code" = 'RECRUITER_BASIC';

-- 2. Tạo RECRUITER_PRO. Giá là placeholder mang sang từ RECRUITER_PREMIUM (gói trả phí
--    cao nhất hiện có) chỉ để thỏa NOT NULL -- `is_public = false` nên không hiển thị,
--    KHÔNG phải giá đã chốt. D3b sẽ quyết định giá/limit AI thật rồi mới public.
INSERT INTO "subscription_plans" (
  "id", "code", "audience", "subscription_name", "price", "description", "duration_days",
  "is_public", "sort_order", "status", "job_post_limit", "talent_contact_limit",
  "boost_credit_limit", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), 'RECRUITER_PRO', 'recruiter', 'Pro', premium."price",
  'Gói Pro -- giá/limit AI đang chờ D3b (đo COGS thật) trước khi công khai.', 30,
  false, 1, 'active', 30, 250, 10, now(), now()
FROM "subscription_plans" premium
WHERE premium."code" = 'RECRUITER_PREMIUM'
  AND NOT EXISTS (SELECT 1 FROM "subscription_plans" WHERE "code" = 'RECRUITER_PRO');

-- 3. Sao chép plan_features của RECRUITER_PREMIUM sang RECRUITER_PRO -- PREMIUM đã có đủ
--    8 key với số hiện hành (6 key non-AI theo mục 17, 2 key AI theo seed gốc), không cần
--    liệt kê lại tay và không có nguy cơ lệch số.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), pro."id", pf."feature", pf."enabled", pf."limit_value", now(), now()
FROM "plan_features" pf
JOIN "subscription_plans" premium ON premium."id" = pf."plan_id" AND premium."code" = 'RECRUITER_PREMIUM'
JOIN "subscription_plans" pro ON pro."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO NOTHING;

-- 4. Migrate NGAY subscription đang active trên hai bậc trả phí cũ sang RECRUITER_PRO.
--    Chỉ `status = 'active'` -- subscription đã EXPIRED/CANCELLED là lịch sử, giữ
--    nguyên plan_id cũ (đúng lúc nó active, không viết lại quá khứ).
UPDATE "company_subscriptions" cs
SET "plan_id" = pro."id"
FROM "subscription_plans" old_plan, "subscription_plans" pro
WHERE cs."plan_id" = old_plan."id"
  AND old_plan."code" IN ('RECRUITER_STANDARD', 'RECRUITER_PREMIUM')
  AND cs."status" = 'active'
  AND pro."code" = 'RECRUITER_PRO';

-- 5. Archive ba gói không còn bán: STANDARD, PREMIUM (đã hết subscription active nhờ
--    bước 4), và LEGACY (đã inactive từ trước, giờ nhất quán trạng thái với hai gói kia).
UPDATE "subscription_plans"
SET "status" = 'archived', "is_public" = false
WHERE "code" IN ('RECRUITER_STANDARD', 'RECRUITER_PREMIUM', 'RECRUITER_LEGACY');
