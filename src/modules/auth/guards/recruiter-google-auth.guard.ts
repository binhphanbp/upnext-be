import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RecruiterGoogleAuthGuard extends AuthGuard('google-recruiter') {
  getAuthenticateOptions(context: any) {
    const request = context.switchToHttp().getRequest();
    const locale = request.query.locale || 'vi';
    return {
      state: locale,
      // Luôn hiện bảng chọn tài khoản Google thay vì tự đăng nhập lại
      // bằng phiên Google đang có sẵn trong trình duyệt.
      prompt: 'select_account',
    };
  }
}
