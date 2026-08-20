import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSubscriptionPlanDto } from './create-subscription-plan.dto';

/**
 * `code` và `audience` bị loại khỏi payload sửa, có chủ đích.
 *
 * `code` là định danh bất biến: logic theo bậc gói, seed và các migration dữ liệu
 * đều tham chiếu nó, nên đổi mã của một gói đang chạy sẽ làm những chỗ đó trỏ vào
 * hư không -- đúng loại lỗi mà migration `20260820030000` phải đi dọn.
 *
 * `audience` quyết định ai mua được gói và gói nào được tự cấp làm gói miễn phí.
 * Đổi nó trên một gói đã có người dùng nghĩa là chuyển subscription của họ sang
 * một phía khác của bảng giá.
 *
 * Đặt sai một trong hai thì cách xử lý đúng là **ngừng bán gói đó** (`status`,
 * `isPublic`) rồi tạo gói mới, chứ không phải sửa tại chỗ.
 */
export class UpdateSubscriptionPlanDto extends PartialType(
  OmitType(CreateSubscriptionPlanDto, ['code', 'audience'] as const),
) {}
