import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedUserRole } from './current-user.decorator';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthenticatedUserRole[]) => SetMetadata(ROLES_KEY, roles);
