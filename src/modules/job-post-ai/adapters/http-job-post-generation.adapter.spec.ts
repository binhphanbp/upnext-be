import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpJobPostGenerationAdapter } from './http-job-post-generation.adapter';

describe('HttpJobPostGenerationAdapter', () => {
  const config = new ConfigService({
    aiServiceUrl: 'http://upnext-ai:8000',
    aiInternalJwtSecret: 's'.repeat(32),
    aiJobPostGenerationTimeoutMs: 45_000,
    appEnv: 'staging',
  });
  const signAsync = jest.fn().mockResolvedValue('job-post-generation-service-token');
  const jwtService = { signAsync } as unknown as JwtService;

  beforeEach(() => jest.restoreAllMocks());

  it('uses a generation-only scope and never forwards source files', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          value: { title: 'Backend Engineer' },
          inputTokens: 44,
          outputTokens: 12,
          model: 'gemini-2.5-flash',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new HttpJobPostGenerationAdapter(config, jwtService);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'Return a structured job post.',
        prompt: 'Create a JD from recruiter form data.',
        responseSchema: { type: 'OBJECT' },
        temperature: 0.3,
      }),
    ).resolves.toEqual({
      value: { title: 'Backend Engineer' },
      inputTokens: 44,
      outputTokens: 12,
      modelName: 'gemini-2.5-flash',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://upnext-ai:8000/internal/v1/job-posts/generate',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer job-post-generation-service-token',
        }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body as string) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(body).toEqual(
      expect.objectContaining({ modelTier: 'quality', executionProfile: 'interactive' }),
    );
    expect(body).not.toHaveProperty('file');
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'job-post:generate', environment: 'staging' }),
      expect.objectContaining({ audience: 'upnext-ai', issuer: 'upnext-be', subject: 'upnext-be' }),
    );
  });
});
