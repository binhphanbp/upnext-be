import { SetMetadata } from '@nestjs/common';
import { ActorType } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ActorType[]) => SetMetadata(ROLES_KEY, roles);
