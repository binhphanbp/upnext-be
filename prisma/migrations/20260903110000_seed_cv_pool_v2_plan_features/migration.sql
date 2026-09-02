-- Kho CV v2: quyền lợi gói.
--
-- Data-only và idempotent (`ON CONFLICT ... DO UPDATE`), khoá theo
-- `subscription_plans.code`. Ba trục độc lập:
--   1. cv_pool_view          -- bao nhiêu lượt xem chi tiết / tháng.
--   2. cv_pool_unlocked_profile -- xem chi tiết có bị che PII hay không (cờ,
--      không phải hạn mức; đọc qua getFeatureLimit(), không bao giờ consume()).
--   3. cv_pool_ai_search     -- AI lọc Kho CV theo JD, paid-only.

-- Free: 0 -> 5 lượt xem chi tiết/tháng (trước đây 0 = tắt hẳn danh sách; giờ
-- danh sách miễn phí, chỉ chi tiết mới trừ).
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_view', true, 5, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_FREE'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 5, "updated_at" = NOW();

-- Pro: giữ nguyên 500/tháng đã seed từ trước (feature này không đổi ý nghĩa
-- "bao nhiêu lượt", chỉ đổi ý nghĩa "hạn mức reset theo tháng hay theo vòng
-- đời gói" -- không cần đổi con số).
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_view', true, 500, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 500, "updated_at" = NOW();

-- Cờ unlocked-profile: Free tắt hẳn (che PII + không tải CV), Pro bật (không
-- giới hạn -- limit_value NULL vì đây không phải một con số đếm).
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_unlocked_profile', false, 0, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_FREE'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = false, "limit_value" = 0, "updated_at" = NOW();

INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_unlocked_profile', true, NULL, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = NULL, "updated_at" = NOW();

-- AI lọc Kho CV theo JD: paid-only. Free tắt hẳn; Pro 10 lượt/tháng (cùng con
-- số với talent_discovery_run của Pro -- một giả định cần Product ký, không
-- phải một phép đo).
INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_ai_search', false, 0, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_FREE'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = false, "limit_value" = 0, "updated_at" = NOW();

INSERT INTO "plan_features" ("id", "plan_id", "feature", "enabled", "limit_value", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", 'cv_pool_ai_search', true, 10, NOW(), NOW()
FROM "subscription_plans" p WHERE p."code" = 'RECRUITER_PRO'
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = true, "limit_value" = 10, "updated_at" = NOW();
