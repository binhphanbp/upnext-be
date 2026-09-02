-- Migration: Bổ sung 5 quyền quản trị hệ thống và phân quyền cho role SUPER_ADMIN
-- Quyền quản lý tài khoản admin, vai trò và danh mục quyền hạn được giới thiệu từ commit 300b247
-- nhưng chưa có migration cấp vào cơ sở dữ liệu đã chạy.

INSERT INTO "admin_permissions" ("id", "permission_name", "permission_code", "module", "description", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'View Roles', 'roles:read', 'system', 'Xem danh sách vai trò và quyền hạn quản trị.', 31, NOW(), NOW()),
  (gen_random_uuid(), 'Manage Roles', 'roles:write', 'system', 'Tạo, sửa, xóa và phân quyền vai trò quản trị.', 32, NOW(), NOW()),
  (gen_random_uuid(), 'View Admin Users', 'admins:read', 'system', 'Xem danh sách tài khoản quản trị viên.', 33, NOW(), NOW()),
  (gen_random_uuid(), 'Manage Admin Users', 'admins:write', 'system', 'Tạo, sửa, khóa và quản lý tài khoản quản trị viên.', 34, NOW(), NOW()),
  (gen_random_uuid(), 'View Permissions', 'permissions:read', 'system', 'Tra cứu danh mục quyền hạn hệ thống.', 35, NOW(), NOW())
ON CONFLICT ("permission_code") DO NOTHING;

-- Cấp toàn bộ các quyền hệ thống mới cho SUPER_ADMIN
INSERT INTO "admin_role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE (r."role_code" = 'SUPER_ADMIN' OR r."role_name" ILIKE '%super%')
  AND p."permission_code" IN ('roles:read', 'roles:write', 'admins:read', 'admins:write', 'permissions:read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
