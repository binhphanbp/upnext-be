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
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
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
