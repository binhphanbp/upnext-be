import { ZodError } from 'zod';
import { validateEnv } from './env.validation';

const jwtAccessSecret = 'a'.repeat(32);

function createConfig(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: 'development',
    APP_ENV: 'development',
    DATABASE_URL: 'postgresql://upnext:password@localhost:5432/upnext?schema=public',
    JWT_ACCESS_SECRET: jwtAccessSecret,
    CORS_ORIGIN: 'http://localhost:5173,http://127.0.0.1:3000',
    APP_FRONTEND_URL: 'https://upnext.works',
    APP_BACKEND_URL: 'https://api.upnext.works',
    ...overrides,
  };
}

describe('validateEnv CORS origins', () => {
  it('allows localhost origins in development', () => {
    const config = validateEnv(createConfig());

    expect(config.appEnv).toBe('development');
    expect(config.uploadRoot).toBeDefined();
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:3000']);
  });

  it('resolves the configured upload root to an absolute path', () => {
    const config = validateEnv(createConfig({ UPLOAD_ROOT: 'tmp/custom-uploads' }));

    expect(config.uploadRoot).toMatch(/[\\/]tmp[\\/]custom-uploads$/);
  });

  it('allows localhost origins in staging when NODE_ENV is production', () => {
    const config = validateEnv(
      createConfig({
        NODE_ENV: 'production',
        APP_ENV: 'staging',
      }),
    );

    expect(config.appEnv).toBe('staging');
    expect(config.corsOrigins).toContain('http://localhost:5173');
  });

  it('rejects localhost origins only for the production application environment', () => {
    expect(() =>
      validateEnv(
        createConfig({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          CORS_ORIGIN: 'http://localhost:3000',
        }),
      ),
    ).toThrow(ZodError);
  });

  it('rejects localhost APP_FRONTEND_URL in production environment', () => {
    expect(() =>
      validateEnv(
        createConfig({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          CORS_ORIGIN: 'https://upnext.works',
          APP_FRONTEND_URL: 'http://localhost:3000',
        }),
      ),
    ).toThrow(ZodError);
  });

  it('rejects localhost APP_BACKEND_URL in production environment', () => {
    expect(() =>
      validateEnv(
        createConfig({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          CORS_ORIGIN: 'https://upnext.works',
          APP_BACKEND_URL: 'http://localhost:3001',
        }),
      ),
    ).toThrow(ZodError);
  });

  it('does not reject a non-local hostname that contains localhost in its name', () => {
    const config = validateEnv(
      createConfig({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        CORS_ORIGIN: 'https://localhost.example.com',
        APP_FRONTEND_URL: 'https://localhost.example.com',
        APP_BACKEND_URL: 'https://api.localhost.example.com',
      }),
    );

    expect(config.corsOrigins).toEqual(['https://localhost.example.com']);
    expect(config.appFrontendUrl).toBe('https://localhost.example.com');
    expect(config.appBackendUrl).toBe('https://api.localhost.example.com');
  });

  it('normalizes Google OAuth credentials copied with wrapping quotes', () => {
    const config = validateEnv(
      createConfig({
        GOOGLE_CLIENT_ID: ' "google-client-id" ',
        GOOGLE_CLIENT_SECRET: "'google-client-secret'",
      }),
    );

    expect(config.googleClientId).toBe('google-client-id');
    expect(config.googleClientSecret).toBe('google-client-secret');
  });

  it('keeps direct Gemini as the safe default while upnext-ai is not enabled', () => {
    const config = validateEnv(createConfig());

    expect(config.aiLlmProvider).toBe('gemini');
    expect(config.aiEmbeddingProvider).toBe('gemini');
    expect(config.aiJobPostExtractionProvider).toBe('gemini');
    expect(config.aiEmbeddingFallbackToGemini).toBe(true);
    expect(config.aiJobPostExtractionFallbackToGemini).toBe(true);
    expect(config.aiServiceFallbackToGemini).toBe(true);
    expect(config.aiBatchServiceTimeoutMs).toBe(90_000);
  });

  it('requires the private service contract before enabling JD extraction canary', () => {
    expect(() =>
      validateEnv(createConfig({ AI_JOB_POST_EXTRACTION_PROVIDER: 'upnext-ai' })),
    ).toThrow(ZodError);

    const config = validateEnv(
      createConfig({
        AI_JOB_POST_EXTRACTION_PROVIDER: 'upnext-ai',
        AI_SERVICE_URL: 'http://upnext-ai:8000',
        AI_INTERNAL_JWT_SECRET: 'b'.repeat(32),
      }),
    );

    expect(config.aiJobPostExtractionProvider).toBe('upnext-ai');
    expect(config.aiJobPostExtractionTimeoutMs).toBe(45_000);
  });

  it('requires the private service contract before enabling remote embeddings', () => {
    expect(() => validateEnv(createConfig({ AI_EMBEDDING_PROVIDER: 'upnext-ai' }))).toThrow(
      ZodError,
    );
    const config = validateEnv(
      createConfig({
        AI_EMBEDDING_PROVIDER: 'upnext-ai',
        AI_SERVICE_URL: 'http://upnext-ai:8000',
        AI_INTERNAL_JWT_SECRET: 'b'.repeat(32),
      }),
    );
    expect(config.aiEmbeddingProvider).toBe('upnext-ai');
  });

  it('bounds the private AI batch timeout separately from interactive requests', () => {
    expect(() => validateEnv(createConfig({ AI_BATCH_SERVICE_TIMEOUT_MS: '9999' }))).toThrow(
      ZodError,
    );

    const config = validateEnv(createConfig({ AI_BATCH_SERVICE_TIMEOUT_MS: '120000' }));
    expect(config.aiBatchServiceTimeoutMs).toBe(120_000);
  });

  it('requires a distinct service URL and signing secret before enabling upnext-ai', () => {
    expect(() => validateEnv(createConfig({ AI_LLM_PROVIDER: 'upnext-ai' }))).toThrow(ZodError);

    const config = validateEnv(
      createConfig({
        AI_LLM_PROVIDER: 'upnext-ai',
        AI_SERVICE_URL: 'http://upnext-ai:8000',
        AI_INTERNAL_JWT_SECRET: 'a'.repeat(32),
      }),
    );

    expect(config.aiLlmProvider).toBe('upnext-ai');
    expect(config.aiServiceUrl).toBe('http://upnext-ai:8000');
  });
});
