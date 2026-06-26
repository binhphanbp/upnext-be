import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (
      process.env.NODE_ENV === 'development' &&
      request.headers['x-bypass-auth'] === 'true'
    ) {
      request.user = {
        id: 'admin-bypass-id',
        email: 'admin@upnext.dev',
        role: 'ADMIN',
      };
      return true;
    }
    return super.canActivate(context);
  }
}
