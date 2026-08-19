-- Sửa hai hệ quả của một chỗ lệch tên mã gói, phát hiện khi chạy migration
-- 20260819140000 trên một database thật.
--
-- Nguồn gốc: migration 20260731010000_backfill_plan_features sinh `code` từ TÊN gói:
--
--   SET "code" = 'RECRUITER_' || upper(regexp_replace("subscription_name", '[^a-zA-Z0-9]+', '_', 'g'))
--
-- nên 'Basic Trial' thành `RECRUITER_BASIC_TRIAL`. Nhưng `prisma/seed.ts` lại upsert
-- theo `RECRUITER_BASIC`. Trên mọi database đã đi qua backfill đó:
--
--   1. Migration 20260819140000 KHÔNG khớp hàng nào (nó lọc `code = 'RECRUITER_BASIC'`),
--      nên gói miễn phí vẫn còn `duration_days = 14` -- tức lỗi reset hạn mức mỗi 14
--      ngày chưa được sửa, dù migration đó đã chạy thành công.
--   2. Chạy `prisma db seed` sẽ TẠO GÓI TRÙNG: upsert không tìm thấy `RECRUITER_BASIC`
--      nên insert một hàng mới, để lại hai gói cùng tên "Basic Trial".
--
-- Không có chỗ nào trong `src/` tham chiếu các mã này bằng chuỗi cứng, nên đổi mã là
-- an toàn. Mã cũ là sản phẩm phụ của một backfill tự động, chưa từng là lựa chọn có ý
-- thức, nên chuẩn hóa về đúng mã mà seed dùng là hợp lý.

-- 1. Chuẩn hóa mã gói recruiter về đúng giá trị seed dùng.
--    `NOT EXISTS` để không đụng unique constraint nếu mã đích đã tồn tại (database
--    seed mới sẽ không khớp nhánh nào ở đây -- đúng ý, đây là no-op với chúng).
UPDATE "subscription_plans" AS p
SET "code" = v."target"
FROM (VALUES
  ('RECRUITER_BASIC_TRIAL',   'RECRUITER_BASIC'),
  ('RECRUITER_STANDARD_PLAN', 'RECRUITER_STANDARD'),
  ('RECRUITER_PREMIUM_PLAN',  'RECRUITER_PREMIUM'),
  ('RECRUITER_LEGACY_PLAN',   'RECRUITER_LEGACY')
) AS v("current", "target")
WHERE p."code" = v."current"
  AND NOT EXISTS (
    SELECT 1 FROM "subscription_plans" x WHERE x."code" = v."target"
  );

-- 2. Áp lại bản sửa chu kỳ gói miễn phí, lần này KHÔNG phụ thuộc `code`.
--
--    Chọn theo HÌNH DẠNG của gói, đúng như `provisionFreeSubscription()` chọn:
--    `audience` + `price = 0` + `sortOrder`. Đây mới là predicate đúng -- gói miễn phí
--    được nhận diện bằng giá 0, không bằng tên. Nhờ vậy migration này vẫn chạy đúng
--    trên database có mã gói khác, kể cả mã do người khác đặt sau này.
--
--    `duration_days` của gói miễn phí CHÍNH LÀ chu kỳ reset hạn mức: mỗi lần gói hết
--    hạn, entitlement resolution cấp một subscription mới với bộ đếm về 0. Ở 14 ngày,
--    hạn mức AI miễn phí được làm mới hơn hai lần mỗi tháng.
UPDATE "subscription_plans"
SET "duration_days" = 30
WHERE "audience" = 'recruiter'
  AND "price" = 0
  AND "duration_days" < 30;

UPDATE "subscription_plans"
SET "duration_days" = 30
WHERE "audience" = 'candidate'
  AND "price" = 0
  AND "duration_days" < 30;

-- 3. Áp lại bản sửa `CANDIDATE_PRO`, cũng không phụ thuộc `code`: gói ứng viên trả phí
--    phải hiển thị công khai, nếu không `candidateSandboxCheckout()` (lọc
--    `is_public = true`) sẽ từ chối mọi lần nâng cấp bằng SUBSCRIPTION_PLAN_NOT_AVAILABLE.
UPDATE "subscription_plans"
SET "is_public" = true,
    "highlight_label" = NULL
WHERE "audience" = 'candidate'
  AND "price" > 0
  AND "is_public" = false;

-- Không xóa, không gộp gói nào. Nếu một database đã bị seed hai lần và có gói trùng
-- tên, migration này KHÔNG tự dọn -- gộp gói phải xem subscription nào đang trỏ vào
-- đâu, và đó là việc cần người quyết định, không phải việc của migration.
