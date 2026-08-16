import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpGroundedResearchAdapter } from './http-grounded-research.adapter';

describe('HttpGroundedResearchAdapter', () => {
  const config = new ConfigService({
    aiServiceUrl: 'http://upnext-ai:8000',
    aiInternalJwtSecret: 's'.repeat(32),
    aiGroundedResearchTimeoutMs: 75_000,
    appEnv: 'staging',
  });
  const signAsync = jest.fn().mockResolvedValue('grounded-research-service-token');
  const jwtService = { signAsync } as unknown as JwtService;

  beforeEach(() => jest.restoreAllMocks());

  function ok(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('uses a research-only scope and returns the answer with its evidence', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      ok({
        text: '{"available":true}',
        sources: [{ title: 'ITviec', url: 'https://example.com/itviec' }],
        searchQueries: ['backend salary vietnam'],
        inputTokens: 402,
        outputTokens: 463,
        model: 'upnext-ai/gemini',
      }),
    );
    const adapter = new HttpGroundedResearchAdapter(config, jwtService);

    await expect(
      adapter.generateGrounded({
        systemInstruction: 'Bạn là chuyên gia nghiên cứu lương IT.',
        prompt: 'Mức lương Backend Developer 3 năm kinh nghiệm?',
        temperature: 0.1,
      }),
    ).resolves.toEqual({
      text: '{"available":true}',
      sources: [{ title: 'ITviec', url: 'https://example.com/itviec' }],
      searchQueries: ['backend salary vietnam'],
      inputTokens: 402,
      outputTokens: 463,
      modelName: 'upnext-ai/gemini',
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('http://upnext-ai:8000/internal/v1/research/grounded');
    // A grounded run is the most expensive capability in the service; a token minted for it
    // must not be reusable for anything else, and vice versa.
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'research:grounded' }),
      expect.objectContaining({ audience: 'upnext-ai', issuer: 'upnext-be' }),
    );
    // No response schema is negotiated here: one would empty the grounding metadata.
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('responseSchema');
    expect(body.prompt).toBe('Mức lương Backend Developer 3 năm kinh nghiệm?');
  });

  it('drops evidence entries that are not usable citations', async () => {
    // The caller counts distinct sources to decide confidence, so an unusable or repeated
    // entry must not inflate that count on its way through.
    jest.spyOn(global, 'fetch').mockResolvedValue(
      ok({
        text: '{"available":true}',
        sources: [
          { title: 'ITviec', url: 'https://example.com/itviec' },
          { title: 'ITviec again', url: 'https://example.com/itviec' },
          { title: 'No scheme', url: 'javascript:alert(1)' },
          { title: '', url: 'https://example.com/empty-title' },
          { title: 'TopCV', url: 'https://example.com/topcv' },
        ],
        searchQueries: ['backend salary vietnam', '  ', 42],
        inputTokens: 1,
        outputTokens: 1,
        model: 'upnext-ai/gemini',
      }),
    );
    const adapter = new HttpGroundedResearchAdapter(config, jwtService);

    const result = await adapter.generateGrounded({
      systemInstruction: 'x',
      prompt: 'y',
    });

    expect(result.sources).toEqual([
      { title: 'ITviec', url: 'https://example.com/itviec' },
      { title: 'TopCV', url: 'https://example.com/topcv' },
    ]);
    expect(result.searchQueries).toEqual(['backend salary vietnam']);
  });

  it('preserves the service error code so the caller can tell an outage from a bad answer', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: 'AI_PROVIDER_REGION_BLOCKED' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new HttpGroundedResearchAdapter(config, jwtService);

    await expect(adapter.generateGrounded({ systemInstruction: 'x', prompt: 'y' })).rejects.toThrow(
      'AI_PROVIDER_REGION_BLOCKED',
    );
  });

  it('rejects a malformed service response instead of returning an unusable answer', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok({ text: 'answer' }));
    const adapter = new HttpGroundedResearchAdapter(config, jwtService);

    await expect(adapter.generateGrounded({ systemInstruction: 'x', prompt: 'y' })).rejects.toThrow(
      'AI_INVALID_OUTPUT',
    );
  });
});
