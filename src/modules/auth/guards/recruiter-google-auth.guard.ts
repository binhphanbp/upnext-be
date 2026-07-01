import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RecruiterGoogleAuthGuard extends AuthGuard('google-recruiter') {
  getAuthenticateOptions(context: any) {
    const request = context.switchToHttp().getRequest();
    const locale = request.query.locale || 'vi';
    return {
      state: locale,
    };
  }
}
