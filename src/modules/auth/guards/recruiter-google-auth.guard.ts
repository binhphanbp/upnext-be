import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RecruiterGoogleAuthGuard extends AuthGuard('google-recruiter') {
  private readonly logger = new Logger(RecruiterGoogleAuthGuard.name);

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

  handleRequest<TUser = any>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      const providerMessage =
        err instanceof Error
          ? err.message
          : info instanceof Error
            ? info.message
            : ((info as { message?: string })?.message ??
              'Google did not return a recruiter profile');

      this.logger.error(`Recruiter Google OAuth callback failed: ${providerMessage}`);
      request.googleOAuthError =
        'Đăng nhập Google thất bại. Vui lòng thử lại hoặc sử dụng email và mật khẩu.';
      return null as TUser;
    }

    return user as TUser;
  }
}
