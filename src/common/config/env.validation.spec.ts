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
    ...overrides,
  };
}

describe('validateEnv CORS origins', () => {
  it('allows localhost origins in development', () => {
    const config = validateEnv(createConfig());

    expect(config.appEnv).toBe('development');
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:3000']);
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
      }),
    );

    expect(config.corsOrigins).toEqual(['https://localhost.example.com']);
  });
});
