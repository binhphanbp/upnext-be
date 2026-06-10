import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthenticatedUserRole = 'admin' | 'recruiter' | 'candidate';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: AuthenticatedUserRole;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
