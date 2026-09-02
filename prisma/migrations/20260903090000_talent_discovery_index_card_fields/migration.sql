-- Hai trường hiển thị của card ẩn danh.
--
-- Vì sao phải denormalize thay vì join lúc đọc: card được dựng trong worker,
-- và §2.7 nói type đầu vào của scorer không được chứa gì có thể nhận dạng. Kéo
-- `CandidateJobPreference` vào đường đọc sẽ mang theo cả `desiredSalaryMin`,
-- `desiredPosition` thô và mọi cột tương lai ai đó thêm vào bảng đó. Hai cột ở
-- đây là danh sách CHO PHÉP, không phải một join có thể phình ra.
--
-- `headline` chỉ được ghi sau khi đã đi qua `sanitizeDiscoveryText()` và
-- `assertNoDiscoveryPii()` — cùng hàng rào mà `sanitized_text` đi qua. Nguồn của
-- nó (`desiredPosition`) là free text ứng viên tự gõ nên có thể chứa tên công
-- ty; hàng rào đó là điều kiện để cột này tồn tại.
ALTER TABLE "talent_discovery_indexes"
  ADD COLUMN IF NOT EXISTS "headline" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "notice_period_band" VARCHAR(40);
