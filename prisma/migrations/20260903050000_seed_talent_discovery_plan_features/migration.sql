-- AI Talent Discovery: quyền lợi gói theo §8.
--
-- Data-only và idempotent (`ON CONFLICT ... DO UPDATE`), khoá theo
-- `subscription_plans.code` chứ không theo id: production có thể không chạy
-- `prisma/seed.ts`, nên giá trị phải được đặt bằng migration.
--
-- KHÔNG cập nhật `subscription_quota_counters`: `peek()` đọc `limit` từ
-- `plan_features` và `getOrCreateCounter` làm mới `limit_value` ở mỗi lần upsert,
-- nên chạm vào counter là thêm rủi ro mà không thêm hiệu quả.

-- 1 lượt Discovery cho Free, 10 cho Pro.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'talent_discovery_run', true, 1, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_FREE'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 1, "updated_at" = NOW();

INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'talent_discovery_run', true, 10, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 10, "updated_at" = NOW();

-- Trần số card mỗi lượt: 5 cho Free, 30 cho Pro. Đọc qua `getFeatureLimit()`,
-- không bao giờ `consume()`.
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'talent_discovery_card', true, 5, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_FREE'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 5, "updated_at" = NOW();

INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'talent_discovery_card', true, 30, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 30, "updated_at" = NOW();

-- §8 cho Free "1 lời mời trao đổi thử nghiệm/chu kỳ"; giá trị đang chạy là 0.
-- `assertFeatureEnabled` ném khi `limit_value <= 0`, nên đây là thay đổi MỞ
-- quyền cho gói miễn phí và cần Product ký (§16).
UPDATE "plan_features" pf
SET "limit_value" = 1, "enabled" = true, "updated_at" = NOW()
FROM "subscription_plans" p
WHERE pf."plan_id" = p."id"
  AND p."code" = 'RECRUITER_FREE'
  AND pf."feature" = 'talent_contact'
  AND pf."limit_value" = 0;
