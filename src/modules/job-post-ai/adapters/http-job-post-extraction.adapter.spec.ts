import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpJobPostExtractionAdapter } from './http-job-post-extraction.adapter';

describe('HttpJobPostExtractionAdapter', () => {
  const config = new ConfigService({
    aiServiceUrl: 'http://upnext-ai:8000',
    aiInternalJwtSecret: 's'.repeat(32),
    aiJobPostExtractionTimeoutMs: 45_000,
    appEnv: 'staging',
  });
  const signAsync = jest.fn().mockResolvedValue('job-post-service-token');
  const jwtService = { signAsync } as unknown as JwtService;

  beforeEach(() => jest.restoreAllMocks());

  it('uses the dedicated scope and forwards only the JD extraction contract', async () => {
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
    const adapter = new HttpJobPostExtractionAdapter(config, jwtService);

    await expect(
      adapter.extractStructured({
        systemInstruction: 'Return a structured job post.',
        prompt: 'Extract this recruiter-provided PDF.',
        responseSchema: { type: 'OBJECT' },
        file: { mimeType: 'application/pdf', base64Data: 'cGRm' },
        temperature: 0.3,
      }),
    ).resolves.toEqual({
      value: { title: 'Backend Engineer' },
      inputTokens: 44,
      outputTokens: 12,
      modelName: 'gemini-2.5-flash',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://upnext-ai:8000/internal/v1/job-posts/extract',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer job-post-service-token' }),
      }),
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body as string) ?? '{}')).toEqual(
      expect.objectContaining({
        file: { mimeType: 'application/pdf', base64Data: 'cGRm' },
        modelTier: 'quality',
        executionProfile: 'interactive',
      }),
    );
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'job-post:extract', environment: 'staging' }),
      expect.objectContaining({ audience: 'upnext-ai', issuer: 'upnext-be', subject: 'upnext-be' }),
    );
  });

  it('preserves malformed provider output without treating it as an outage', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: { code: 'AI_INVALID_OUTPUT' } }), { status: 502 }),
      );
    const adapter = new HttpJobPostExtractionAdapter(config, jwtService);

    await expect(
      adapter.extractStructured({
        systemInstruction: 'x',
        prompt: 'x',
        responseSchema: {},
      }),
    ).rejects.toThrow('AI_INVALID_OUTPUT');
  });
});
