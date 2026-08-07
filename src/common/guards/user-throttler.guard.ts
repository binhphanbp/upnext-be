import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Chặn lặp theo người dùng đã đăng nhập, không theo IP.
 *
 * `ThrottlerGuard` mặc định của `@nestjs/throttler` khoá theo `req.ip`. Đúng cho
 * endpoint công khai (login, quên mật khẩu), sai cho endpoint đã có JWT: nhiều
 * người dùng sau cùng một NAT (văn phòng, ký túc xá) sẽ vô tình chặn nhau, còn
 * kẻ muốn lách chỉ cần đổi IP là xong — hạn mức phải gắn với danh tính, không
 * phải với địa chỉ mạng.
 *
 * Guard này phải đứng **sau** `JwtAuthGuard` trong `@UseGuards(...)` để
 * `req.user` đã có khi `getTracker` chạy. Fallback về IP khi không có user để
 * guard vẫn dùng được trên route không bắt buộc đăng nhập.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return user?.id ? `user:${user.id}` : `ip:${String(req.ip)}`;
  }
}
