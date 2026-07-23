import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_RESTRICTED_KEY = 'allowWhenRestricted';

/**
 * Đánh dấu route được phép truy cập ngay cả khi company của recruiter đang ở Restricted Mode
 * (vd: xem dashboard, lịch sử vi phạm, gửi kháng cáo). Mặc định mọi route ghi dữ liệu của
 * recruiter đều bị RestrictedModeGuard chặn trừ khi có decorator này.
 */
export const AllowWhenRestricted = () => SetMetadata(ALLOW_WHEN_RESTRICTED_KEY, true);
