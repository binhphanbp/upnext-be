import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpLlmAdapter } from './http-llm.adapter';

describe('HttpLlmAdapter', () => {
  const config = new ConfigService({
    aiServiceUrl: 'http://upnext-ai:8000',
    aiInternalJwtSecret: 'a'.repeat(32),
    aiServiceTimeoutMs: 5_000,
    aiBatchServiceTimeoutMs: 90_000,
    appEnv: 'staging',
  });
  const signAsync = jest.fn().mockResolvedValue('internal-service-token');
  const jwtService = {
    signAsync,
  } as unknown as JwtService;

  beforeEach(() => jest.restoreAllMocks());

  it('sends only an authenticated contract to the private structured endpoint', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          value: { intent: 'search' },
          inputTokens: 4,
          outputTokens: 2,
          model: 'test',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new HttpLlmAdapter(config, jwtService);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'Classify intent.',
        messages: [{ role: 'user', text: 'Tìm việc React' }],
        responseSchema: { type: 'object' },
        modelTier: 'quality',
        executionProfile: 'batch',
      }),
    ).resolves.toEqual({
      value: { intent: 'search' },
      inputTokens: 4,
      outputTokens: 2,
      modelName: 'test',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://upnext-ai:8000/internal/v1/llm/structured',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer internal-service-token' }),
      }),
    );
    expect(JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body as string) ?? '{}')).toEqual(
      expect.objectContaining({ modelTier: 'quality', executionProfile: 'batch' }),
    );
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'llm:invoke', environment: 'staging' }),
      expect.objectContaining({ audience: 'upnext-ai', issuer: 'upnext-be', subject: 'upnext-be' }),
    );
  });

  it('maps a private service rate limit to the stable AI error code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    const adapter = new HttpLlmAdapter(config, jwtService);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'x',
        messages: [{ role: 'user', text: 'x' }],
        responseSchema: {},
      }),
    ).rejects.toThrow('AI_MODEL_RATE_LIMIT');
  });

  it.each([
    [502, 'AI_INVALID_OUTPUT'],
    [504, 'AI_MODEL_TIMEOUT'],
  ])('preserves the private service error contract for HTTP %i', async (status, code) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: { code, message: 'safe provider message' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new HttpLlmAdapter(config, jwtService);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'x',
        messages: [{ role: 'user', text: 'x' }],
        responseSchema: {},
      }),
    ).rejects.toThrow(code);
  });

  it('does not trust unknown error codes returned by the private service', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: 'AI_EXPOSE_INTERNAL_SECRET' } }), {
        status: 502,
      }),
    );
    const adapter = new HttpLlmAdapter(config, jwtService);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'x',
        messages: [{ role: 'user', text: 'x' }],
        responseSchema: {},
      }),
    ).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
  });
});
