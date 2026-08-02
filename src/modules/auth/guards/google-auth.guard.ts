import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const locale = request.query.locale === 'en' ? 'en' : 'vi';

    return {
      state: locale,
      prompt: 'select_account',
    };
  }

  handleRequest<TUser = unknown>(
    error: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (error || !user) {
      const request = context.switchToHttp().getRequest();
      const providerMessage =
        error instanceof Error
          ? error.message
          : info instanceof Error
            ? info.message
            : ((info as { message?: string })?.message ??
              'Google did not return a candidate profile');

      this.logger.error(`Candidate Google OAuth callback failed: ${providerMessage}`);
      request.googleOAuthError =
        'Đăng nhập Google thất bại. Vui lòng thử lại hoặc sử dụng email và mật khẩu.';
      return null as TUser;
    }

    return user as TUser;
  }
}
