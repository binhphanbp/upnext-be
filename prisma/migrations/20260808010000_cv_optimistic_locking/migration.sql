-- Khoá lạc quan cho CV: chặn ghi đè âm thầm khi một CV bị sửa từ hai tab/thiết
-- bị cùng lúc. Mặc định 0, tăng dần ở mỗi lần cập nhật thành công.
ALTER TABLE "cvs" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
