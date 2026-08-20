-- D2 (KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 18): `feature` thôi là Prisma enum
-- `SubscriptionFeature`, chuyển thành VARCHAR(60) trên cả 6 bảng đang dùng nó. Thêm một
-- capability mới (ví dụ các key AI B2C sắp tới) giờ là một thay đổi data (INSERT vào
-- `plan_features`), không phải một migration `ALTER TYPE ... ADD VALUE` đụng 6 bảng.
--
-- Danh sách key hợp lệ giờ sống ở `src/modules/subscriptions/feature-registry.ts`, không
-- còn được Postgres ràng buộc bằng enum. `IsEnum(SubscriptionFeature)` ở tầng DTO
-- (`set-plan-features.dto.ts`) là nơi validate thay cho enum.
--
-- An toàn về dữ liệu: mỗi giá trị enum đã có @map bằng đúng chuỗi text tương ứng
-- (`JOB_POST @map("job_post")`, ...), nên `feature::text` cho ra chính xác chuỗi cũ --
-- không có bản ghi nào đổi giá trị. `ALTER COLUMN ... TYPE` giữ nguyên index/unique
-- constraint đang tham chiếu cột này (Postgres tự dựng lại), không cần DROP/CREATE lại.

ALTER TABLE "plan_features"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

ALTER TABLE "subscription_quota_counters"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

ALTER TABLE "subscription_usages"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

ALTER TABLE "ai_usage_logs"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

ALTER TABLE "candidate_subscription_quota_counters"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

ALTER TABLE "candidate_subscription_usages"
  ALTER COLUMN "feature" TYPE VARCHAR(60) USING "feature"::text;

-- Contract: không còn cột nào tham chiếu type này.
DROP TYPE "SubscriptionFeature";
