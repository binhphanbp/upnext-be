-- Lời mời vào công ty vốn không có hạn: link `/recruiter/company-invitations/<uuid>` gửi
-- qua email sống vĩnh viễn tới khi được accept, mà endpoint accept-and-set-password là
-- public và đặt được mật khẩu cho tài khoản NTD — nên một email mời cũ bị rò rỉ là đủ để
-- tạo tài khoản trong công ty đó. Cột này đóng cửa sổ đó lại.
ALTER TABLE "company_members" ADD COLUMN IF NOT EXISTS "invitation_expires_at" TIMESTAMP(3);

-- Backfill: cho mọi lời mời đang treo thêm 7 ngày kể từ lúc migrate, thay vì tính từ
-- `created_at` (sẽ làm hết hạn tức thì các lời mời đang trên đường đi).
UPDATE "company_members"
SET "invitation_expires_at" = NOW() + INTERVAL '7 days'
WHERE "status" = 'invited' AND "invitation_expires_at" IS NULL;
