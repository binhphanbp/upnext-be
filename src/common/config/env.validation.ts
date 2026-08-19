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
    AI_LLM_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_EMBEDDING_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_JOB_POST_GENERATION_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_JOB_POST_EXTRACTION_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_COMPANY_LICENSE_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_GROUNDED_RESEARCH_PROVIDER: z.enum(['gemini', 'upnext-ai']).default('gemini'),
    AI_SERVICE_URL: z.string().url().optional(),
    AI_INTERNAL_JWT_SECRET: z.string().min(32).optional(),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(25_000),
    AI_EMBEDDING_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
    AI_JOB_POST_GENERATION_SERVICE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(45_000),
    AI_JOB_POST_EXTRACTION_SERVICE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(45_000),
    AI_COMPANY_LICENSE_SERVICE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(45_000),
    // A grounded run issues several live web searches before answering; measured round trips
    // sit at 42-50s, so the shared 45s ceiling above would abort most calls.
    AI_GROUNDED_RESEARCH_SERVICE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(20_000)
      .max(150_000)
      .default(75_000),
    AI_BATCH_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(150_000).default(90_000),
    AI_SERVICE_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_EMBEDDING_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_JOB_POST_GENERATION_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_JOB_POST_EXTRACTION_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_COMPANY_LICENSE_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_GROUNDED_RESEARCH_FALLBACK_TO_GEMINI: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    // Cầu dao chi phí AI, KHÔNG phải hạn mức gói. Hạn mức người dùng thấy là quota
    // `AI_COPILOT_RUN` trong `plan_features`; hai ngưỡng dưới đây phải luôn **cao hơn
    // hạn mức mỗi chu kỳ của gói cao nhất**, nếu không người đã trả tiền sẽ bị chặn
    // bởi một giới hạn thứ hai không có trong bảng giá. Xem `AiBudgetService`.
    //
    // Gói cao nhất hiện tại (CANDIDATE_PRO) cho 100 lượt/chu kỳ, mà một người có thể
    // dùng hết trong một ngày một cách hoàn toàn hợp lệ. Ngưỡng cũ 50 lượt/ngày nằm
    // DƯỚI mức đó, tức người dùng Pro bị chặn ở lượt thứ 51 dù còn 49 lượt trong gói.
    AI_MAX_RUNS_PER_DAY: z.coerce.number().int().positive().default(300),
    // 300 lượt × ~10.000 token/lượt. Đây là ngưỡng có ích thật: quota gói đã chặn số
    // lượt, nên cầu dao chủ yếu để bắt một lượt phình token bất thường hoặc một
    // `plan_features` bị đặt `limitValue = null` ngoài ý muốn.
    AI_MAX_TOKENS_PER_DAY: z.coerce.number().int().positive().default(3_000_000),
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
    SUBSCRIPTION_SANDBOX_CHECKOUT_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    UPLOAD_ROOT: z
      .string()
      .trim()
      .min(1)
      .default(resolve(process.cwd(), 'uploads'))
      .transform((value) => resolve(value)),
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
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

    if (
      (env.AI_LLM_PROVIDER === 'upnext-ai' ||
        env.AI_EMBEDDING_PROVIDER === 'upnext-ai' ||
        env.AI_JOB_POST_GENERATION_PROVIDER === 'upnext-ai' ||
        env.AI_JOB_POST_EXTRACTION_PROVIDER === 'upnext-ai' ||
        env.AI_COMPANY_LICENSE_PROVIDER === 'upnext-ai' ||
        env.AI_GROUNDED_RESEARCH_PROVIDER === 'upnext-ai') &&
      !env.AI_SERVICE_URL
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_SERVICE_URL'],
        message: 'AI_SERVICE_URL is required when an AI provider is upnext-ai',
      });
    }
    if (
      (env.AI_LLM_PROVIDER === 'upnext-ai' ||
        env.AI_EMBEDDING_PROVIDER === 'upnext-ai' ||
        env.AI_JOB_POST_GENERATION_PROVIDER === 'upnext-ai' ||
        env.AI_JOB_POST_EXTRACTION_PROVIDER === 'upnext-ai' ||
        env.AI_COMPANY_LICENSE_PROVIDER === 'upnext-ai' ||
        env.AI_GROUNDED_RESEARCH_PROVIDER === 'upnext-ai') &&
      !env.AI_INTERNAL_JWT_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_INTERNAL_JWT_SECRET'],
        message: 'AI_INTERNAL_JWT_SECRET is required when an AI provider is upnext-ai',
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
  aiLlmProvider: 'gemini' | 'upnext-ai';
  aiEmbeddingProvider: 'gemini' | 'upnext-ai';
  aiJobPostGenerationProvider: 'gemini' | 'upnext-ai';
  aiJobPostExtractionProvider: 'gemini' | 'upnext-ai';
  aiCompanyLicenseProvider: 'gemini' | 'upnext-ai';
  aiGroundedResearchProvider: 'gemini' | 'upnext-ai';
  aiServiceUrl?: string;
  aiInternalJwtSecret?: string;
  aiServiceTimeoutMs: number;
  aiEmbeddingServiceTimeoutMs: number;
  aiJobPostGenerationTimeoutMs: number;
  aiJobPostExtractionTimeoutMs: number;
  aiCompanyLicenseExtractionTimeoutMs: number;
  aiGroundedResearchTimeoutMs: number;
  aiBatchServiceTimeoutMs: number;
  aiServiceFallbackToGemini: boolean;
  aiEmbeddingFallbackToGemini: boolean;
  aiJobPostGenerationFallbackToGemini: boolean;
  aiJobPostExtractionFallbackToGemini: boolean;
  aiCompanyLicenseFallbackToGemini: boolean;
  aiGroundedResearchFallbackToGemini: boolean;
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
  subscriptionSandboxCheckoutEnabled: boolean;
  firebaseProjectId?: string;
  firebaseClientEmail?: string;
  firebasePrivateKey?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
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
    aiLlmProvider: parsed.AI_LLM_PROVIDER,
    aiEmbeddingProvider: parsed.AI_EMBEDDING_PROVIDER,
    aiJobPostGenerationProvider: parsed.AI_JOB_POST_GENERATION_PROVIDER,
    aiJobPostExtractionProvider: parsed.AI_JOB_POST_EXTRACTION_PROVIDER,
    aiCompanyLicenseProvider: parsed.AI_COMPANY_LICENSE_PROVIDER,
    aiGroundedResearchProvider: parsed.AI_GROUNDED_RESEARCH_PROVIDER,
    aiServiceUrl: parsed.AI_SERVICE_URL,
    aiInternalJwtSecret: parsed.AI_INTERNAL_JWT_SECRET,
    aiServiceTimeoutMs: parsed.AI_SERVICE_TIMEOUT_MS,
    aiEmbeddingServiceTimeoutMs: parsed.AI_EMBEDDING_SERVICE_TIMEOUT_MS,
    aiJobPostGenerationTimeoutMs: parsed.AI_JOB_POST_GENERATION_SERVICE_TIMEOUT_MS,
    aiJobPostExtractionTimeoutMs: parsed.AI_JOB_POST_EXTRACTION_SERVICE_TIMEOUT_MS,
    aiCompanyLicenseExtractionTimeoutMs: parsed.AI_COMPANY_LICENSE_SERVICE_TIMEOUT_MS,
    aiGroundedResearchTimeoutMs: parsed.AI_GROUNDED_RESEARCH_SERVICE_TIMEOUT_MS,
    aiBatchServiceTimeoutMs: parsed.AI_BATCH_SERVICE_TIMEOUT_MS,
    aiServiceFallbackToGemini: parsed.AI_SERVICE_FALLBACK_TO_GEMINI,
    aiEmbeddingFallbackToGemini: parsed.AI_EMBEDDING_FALLBACK_TO_GEMINI,
    aiJobPostGenerationFallbackToGemini: parsed.AI_JOB_POST_GENERATION_FALLBACK_TO_GEMINI,
    aiJobPostExtractionFallbackToGemini: parsed.AI_JOB_POST_EXTRACTION_FALLBACK_TO_GEMINI,
    aiCompanyLicenseFallbackToGemini: parsed.AI_COMPANY_LICENSE_FALLBACK_TO_GEMINI,
    aiGroundedResearchFallbackToGemini: parsed.AI_GROUNDED_RESEARCH_FALLBACK_TO_GEMINI,
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
    subscriptionSandboxCheckoutEnabled: parsed.SUBSCRIPTION_SANDBOX_CHECKOUT_ENABLED,
    firebaseProjectId: parsed.FIREBASE_PROJECT_ID,
    firebaseClientEmail: parsed.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: parsed.FIREBASE_PRIVATE_KEY,
    FIREBASE_PROJECT_ID: parsed.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: parsed.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: parsed.FIREBASE_PRIVATE_KEY,
  };
}
