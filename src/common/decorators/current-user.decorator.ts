import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorType } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: ActorType;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
