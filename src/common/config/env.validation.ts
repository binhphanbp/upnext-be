import { z } from 'zod';
import { resolve } from 'node:path';

const appEnvironmentSchema = z.enum(['development', 'staging', 'production']);

function parseCorsOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function normalizeCredential(value: string): string {
  const trimmed = value.trim();
  const hasMatchingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  return hasMatchingQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

const optionalCredentialSchema = z
  .string()
  .transform(normalizeCredential)
  .pipe(z.string().min(1))
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: appEnvironmentSchema,
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    APP_FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().default('upnext'),
    CORS_ORIGIN: z
      .string()
      .default(
        'https://upnext.works,https://staging.upnext.works,http://localhost:5173,http://localhost:3000',
      ),
    GEMINI_API_KEY: z.string().optional(),
    /**
     * Google chặn `generativelanguage.googleapis.com` theo vị trí địa lý của
     * IP gọi tới — VPS đặt ở một số khu vực bị từ chối thẳng với
     * "User location is not supported for the API use." trước khi chạm tới
     * logic của Copilot. Đặt biến này (URL của một proxy HTTP/HTTPS ở khu vực
     * được hỗ trợ) để route riêng lời gọi Gemini qua đó; để trống thì gọi
     * thẳng như cũ.
     */
    GEMINI_PROXY_URL: z.string().url().optional(),
    AI_MAX_RUNS_PER_DAY: z.coerce.number().int().positive().default(50),
    AI_MAX_TOKENS_PER_DAY: z.coerce.number().int().positive().default(200_000),
    GOOGLE_CLIENT_ID: optionalCredentialSchema,
    GOOGLE_CLIENT_SECRET: optionalCredentialSchema,
    APP_BACKEND_URL: z.string().url().default('http://localhost:3001'),
    ZALO_BOT_TOKEN: z.string().optional(),
    ZALO_BOT_WEBHOOK_SECRET: z.string().min(8).max(256).optional(),
    CHAT_APPLICATION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CHAT_OUTREACH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CHAT_SUPPORT_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    UPLOAD_ROOT: z
      .string()
      .trim()
      .min(1)
      .default(resolve(process.cwd(), 'uploads'))
      .transform((value) => resolve(value)),
  })
  .superRefine((env, ctx) => {
    // Only the production application environment disallows local credentialed origins.
    if (env.APP_ENV === 'production' && parseCorsOrigins(env.CORS_ORIGIN).some(isLocalhostOrigin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must not include localhost origins in production',
      });
    }

    // In production, APP_FRONTEND_URL must not point to localhost (Google OAuth
    // redirects the user back to this URL after authentication).
    if (env.APP_ENV === 'production' && isLocalhostOrigin(env.APP_FRONTEND_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_FRONTEND_URL'],
        message:
          'APP_FRONTEND_URL must not be a localhost URL in production – Google OAuth will redirect users to this URL after login',
      });
    }

    // In production, APP_BACKEND_URL must not point to localhost (used as the
    // Google OAuth callbackURL that Google redirects to after consent).
    if (env.APP_ENV === 'production' && isLocalhostOrigin(env.APP_BACKEND_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_BACKEND_URL'],
        message:
          'APP_BACKEND_URL must not be a localhost URL in production – Google OAuth uses this as the callback URL',
      });
    }
  });

export type AppConfig = {
  nodeEnv: string;
  appEnv: z.infer<typeof appEnvironmentSchema>;
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  appFrontendUrl: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  mailFrom?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  cloudinaryFolder: string;
  corsOrigins: string[];
  geminiApiKey?: string;
  geminiProxyUrl?: string;
  aiMaxRunsPerDay: number;
  aiMaxTokensPerDay: number;
  googleClientId?: string;
  googleClientSecret?: string;
  appBackendUrl?: string;
  zaloBotToken?: string;
  zaloBotWebhookSecret?: string;
  uploadRoot: string;
  chatApplicationEnabled: boolean;
  chatOutreachEnabled: boolean;
  chatSupportEnabled: boolean;
};

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const parsed = envSchema.parse(config);
  const corsOrigins = parseCorsOrigins(parsed.CORS_ORIGIN);

  return {
    nodeEnv: parsed.NODE_ENV,
    appEnv: parsed.APP_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
    jwtAccessExpiresIn: parsed.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: parsed.JWT_REFRESH_EXPIRES_IN,
    appFrontendUrl: parsed.APP_FRONTEND_URL,
    smtpHost: parsed.SMTP_HOST,
    smtpPort: parsed.SMTP_PORT,
    smtpSecure: parsed.SMTP_SECURE,
    smtpUser: parsed.SMTP_USER,
    smtpPass: parsed.SMTP_PASS,
    mailFrom: parsed.MAIL_FROM,
    cloudinaryCloudName: parsed.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: parsed.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: parsed.CLOUDINARY_API_SECRET,
    cloudinaryFolder: parsed.CLOUDINARY_FOLDER,
    corsOrigins,
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiProxyUrl: parsed.GEMINI_PROXY_URL,
    aiMaxRunsPerDay: parsed.AI_MAX_RUNS_PER_DAY,
    aiMaxTokensPerDay: parsed.AI_MAX_TOKENS_PER_DAY,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
    appBackendUrl: parsed.APP_BACKEND_URL,
    zaloBotToken: parsed.ZALO_BOT_TOKEN,
    zaloBotWebhookSecret: parsed.ZALO_BOT_WEBHOOK_SECRET,
    uploadRoot: parsed.UPLOAD_ROOT,
    chatApplicationEnabled: parsed.CHAT_APPLICATION_ENABLED,
    chatOutreachEnabled: parsed.CHAT_OUTREACH_ENABLED,
    chatSupportEnabled: parsed.CHAT_SUPPORT_ENABLED,
  };
}
