import { ActorType } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
  role: ActorType;
  companyId?: string | null;
  recruiterRoleId?: string | null;
  adminRoleId?: string | null;
  tokenVersion?: number;
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

/**
 * Token đăng nhập một lần đi kèm link trong email gửi nhà tuyển dụng.
 *
 * Hạn ngắn hơn hẳn email-verification (24h) vì nó cấp session ngay, không chỉ xác nhận
 * một địa chỉ email — xem MAGIC_LINK_TTL trong auth.service.
 */
export type RecruiterMagicLinkTokenPayload = {
  sub: string;
  email: string;
  role: ActorType;
  purpose: 'recruiter-magic-link';
};
