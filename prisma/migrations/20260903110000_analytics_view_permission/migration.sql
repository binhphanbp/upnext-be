-- Quyền cho trang phân tích từ khóa của admin.
--
-- Trước đây `GET /search-keywords/top` không có guard nào và trả 200 cho mọi request:
-- dữ liệu nhu cầu thị trường (ứng viên đang tìm gì, bao nhiêu lượt) là thông tin cạnh
-- tranh, không nên để mở. Thêm quyền ở đây thay vì chỉ trong seed để môi trường đã chạy
-- cũng nhận được mà không phải seed lại toàn bộ.
INSERT INTO "admin_permissions" ("id", "permission_name", "permission_code", "module", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), 'View Analytics', 'analytics:view', 'analytics',
       'Xem báo cáo phân tích từ khóa tìm kiếm và nhu cầu thị trường.', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_permissions" WHERE "permission_code" = 'analytics:view'
);

-- Cấp cho SUPER_ADMIN: role này vốn được seed với toàn bộ permission, nên quyền mới
-- cũng phải theo, nếu không admin hiện tại sẽ bị 403 ở chính trang vừa làm.
INSERT INTO "admin_role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."role_name" = 'Super Admin'
  AND p."permission_code" = 'analytics:view'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_role_permissions" rp
    WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  );
