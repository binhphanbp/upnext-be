import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export type RequiredPermissions = Readonly<{
  codes: string[];
  match: 'all' | 'any';
}>;

export const Permissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { codes, match: 'all' } satisfies RequiredPermissions);

export const AnyPermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { codes, match: 'any' } satisfies RequiredPermissions);
