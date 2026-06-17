import { ActorType } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
  role: ActorType;
  companyId?: string | null;
  recruiterRoleId?: string | null;
  adminRoleId?: string | null;
};

export type EmailVerificationTokenPayload = {
  sub: string;
  email: string;
  role: ActorType;
  purpose: 'email-verification';
};

export type PasswordResetTokenPayload = {
  sub: string;
  email: string;
  role: ActorType;
  purpose: 'password-reset';
};
