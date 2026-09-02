import { ConflictException } from '@nestjs/common';
import { getUniqueConstraintNames } from '../../prisma/unique-constraint-error';

/**
 * Hai partial unique index từ `20260819130000_one_active_subscription_per_owner`
 * bảo đảm mỗi chủ sở hữu có tối đa một subscription `active`. Đó là ràng buộc
 * đúng, nhưng khi hai request đồng thời cùng kích hoạt cho một chủ sở hữu thì
 * người thua nhận `P2002` — và nếu không ai xử lý, khách thấy **500**.
 */
const ACTIVE_SUBSCRIPTION_INDEXES = [
  'company_subscriptions_one_active_per_company_uq',
  'candidate_subscriptions_one_active_per_profile_uq',
];

/**
 * Đúng cuộc đua "hai subscription active cho cùng chủ sở hữu" hay không.
 *
 * Kiểm cả tên index để không nuốt oan một `P2002` khác — ví dụ
 * `subscription_checkouts` trùng `(audience, ownerId, idempotencyKey)`, vốn có ý
 * nghĩa nghiệp vụ hoàn toàn khác và đã được xử lý riêng.
 */
export function isActiveSubscriptionRace(error: unknown): boolean {
  // Xem `getUniqueConstraintNames` -- trên stack Prisma 7 + @prisma/adapter-pg
  // của project này, `error.meta.target` THƯỜNG KHÔNG CÓ trong một P2002 xảy ra
  // trong transaction; tên constraint chỉ nằm trong message gốc của Postgres.
  // Đọc thẳng `error.meta.target` ở đây từng khiến hàm này không bao giờ khớp.
  const names = getUniqueConstraintNames(error);
  return names.some((name) => ACTIVE_SUBSCRIPTION_INDEXES.includes(name));
}

/**
 * Lỗi trả cho client khi thua cuộc đua kích hoạt.
 *
 * 409 chứ không phải 500 vì đây **không** phải sự cố: một request khác vừa kích
 * hoạt xong cho đúng chủ sở hữu này. Thử lại sẽ thấy subscription đó và thành
 * công, nên thông báo phải mời người dùng thử lại thay vì báo hệ thống lỗi.
 *
 * Dùng ở những chỗ nằm **trong** transaction: Postgres đã hủy transaction khi
 * unique violation xảy ra, nên không thể đọc lại trên cùng `tx` để tự chữa —
 * chỉ có thể đổi lỗi thành thứ client hiểu được rồi để transaction rollback.
 */
export function activeSubscriptionRaceError(): ConflictException {
  return new ConflictException({
    code: 'SUBSCRIPTION_ACTIVATION_RACE',
    message: 'Một yêu cầu khác vừa cập nhật gói của bạn. Vui lòng tải lại và thử lại.',
  });
}
