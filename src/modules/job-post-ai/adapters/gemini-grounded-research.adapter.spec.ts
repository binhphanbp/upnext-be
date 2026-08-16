import { ConfigService } from '@nestjs/config';
import { GeminiGroundedResearchAdapter } from './gemini-grounded-research.adapter';

describe('GeminiGroundedResearchAdapter', () => {
  const config = new ConfigService({
    geminiApiKey: 'test-key',
    aiGroundedResearchTimeoutMs: 75_000,
  });

  beforeEach(() => jest.restoreAllMocks());

  function geminiResponse(candidate: Record<string, unknown>) {
    return new Response(
      JSON.stringify({
        candidates: [candidate],
        usageMetadata: { promptTokenCount: 402, candidatesTokenCount: 463 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('asks for web search without a response schema and collects the citations', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      geminiResponse({
        content: { parts: [{ text: '{"available":true}' }] },
        groundingMetadata: {
          webSearchQueries: ['backend salary vietnam', '  '],
          groundingChunks: [
            { web: { title: 'ITviec', uri: 'https://example.com/itviec' } },
            // Repeated URL: the caller counts distinct sources, so it must not be inflated.
            { web: { title: 'ITviec mirror', uri: 'https://example.com/itviec' } },
            { web: { title: 'TopCV', uri: 'https://example.com/topcv' } },
            { web: { title: 'No scheme', uri: 'ftp://example.com/x' } },
          ],
        },
      }),
    );
    const adapter = new GeminiGroundedResearchAdapter(config);

    await expect(
      adapter.generateGrounded({ systemInstruction: 'persona', prompt: 'question' }),
    ).resolves.toEqual({
      text: '{"available":true}',
      sources: [
        { title: 'ITviec', url: 'https://example.com/itviec' },
        { title: 'TopCV', url: 'https://example.com/topcv' },
      ],
      searchQueries: ['backend salary vietnam'],
      inputTokens: 402,
      outputTokens: 463,
      modelName: 'gemini-2.5-pro',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { body: string }];
    const body = JSON.parse(init.body) as {
      tools?: unknown;
      generationConfig?: Record<string, unknown>;
    };
    // Structured output silently empties groundingMetadata, and a result without citations is
    // rejected downstream, so the JSON shape has to travel in the prompt instead.
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.generationConfig).not.toHaveProperty('responseMimeType');
    expect(body.generationConfig).not.toHaveProperty('responseSchema');
  });

  it('reports a region refusal as unavailable rather than as a bad request', async () => {
    // Gemini answers an unsupported deployment region with HTTP 400. Read literally that is a
    // client error, which is how a hard infrastructure block once read as "no salary data".
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 400, status: 'FAILED_PRECONDITION', message: 'location is not supported' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new GeminiGroundedResearchAdapter(config);

    await expect(
      adapter.generateGrounded({ systemInstruction: 'persona', prompt: 'question' }),
    ).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
  });

  it('fails closed when no API key is configured', async () => {
    const adapter = new GeminiGroundedResearchAdapter(new ConfigService({}));

    expect(adapter.isConfigured()).toBe(false);
    await expect(
      adapter.generateGrounded({ systemInstruction: 'persona', prompt: 'question' }),
    ).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
  });
});
