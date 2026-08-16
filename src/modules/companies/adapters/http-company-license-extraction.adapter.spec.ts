import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpCompanyLicenseExtractionAdapter } from './http-company-license-extraction.adapter';

describe('HttpCompanyLicenseExtractionAdapter', () => {
  const config = new ConfigService({
    aiServiceUrl: 'http://upnext-ai:8000',
    aiInternalJwtSecret: 's'.repeat(32),
    aiCompanyLicenseExtractionTimeoutMs: 45_000,
    appEnv: 'staging',
  });
  const signAsync = jest.fn().mockResolvedValue('licence-service-token');
  const jwtService = { signAsync } as unknown as JwtService;

  const request = {
    systemInstruction: 'Return JSON only.',
    prompt: 'Extract the licence fields.',
    responseSchema: { type: 'OBJECT' },
    file: { mimeType: 'application/pdf' as const, base64Data: 'cGRm' },
  };

  beforeEach(() => jest.restoreAllMocks());

  it('mints a licence-scoped token and calls the dedicated route', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          value: { name: 'UpNext JSC', taxCode: '0101234567' },
          inputTokens: 51,
          outputTokens: 18,
          model: 'gemini-2.5-flash',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new HttpCompanyLicenseExtractionAdapter(config, jwtService);

    await expect(adapter.extractStructured(request)).resolves.toEqual({
      value: { name: 'UpNext JSC', taxCode: '0101234567' },
      inputTokens: 51,
      outputTokens: 18,
      modelName: 'gemini-2.5-flash',
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('http://upnext-ai:8000/internal/v1/companies/license-extract');
    // A licence token must not be usable against any other capability.
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'company-license:extract' }),
      expect.objectContaining({ issuer: 'upnext-be', audience: 'upnext-ai' }),
    );
    expect(JSON.parse(init.body)).toMatchObject({
      file: { mimeType: 'application/pdf', base64Data: 'cGRm' },
      modelTier: 'quality',
    });
  });

  it('surfaces the service error code rather than a generic failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: 'AI_PROVIDER_REGION_BLOCKED' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new HttpCompanyLicenseExtractionAdapter(config, jwtService);

    await expect(adapter.extractStructured(request)).rejects.toThrow('AI_PROVIDER_REGION_BLOCKED');
  });

  it('rejects a malformed service payload instead of passing it through', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ value: {}, inputTokens: 'nope', outputTokens: 1, model: 'x' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const adapter = new HttpCompanyLicenseExtractionAdapter(config, jwtService);

    await expect(adapter.extractStructured(request)).rejects.toThrow('AI_INVALID_OUTPUT');
  });

  it('is not configured without a base url and secret', () => {
    const bare = new HttpCompanyLicenseExtractionAdapter(new ConfigService({}), jwtService);
    expect(bare.isConfigured()).toBe(false);
  });
});
