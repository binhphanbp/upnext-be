import { ConfigService } from '@nestjs/config';
import { GeminiJobPostGenerationAdapter } from './gemini-job-post-generation.adapter';

describe('GeminiJobPostGenerationAdapter', () => {
  const config = new ConfigService({
    geminiApiKey: 'test-key',
    aiJobPostGenerationTimeoutMs: 45_000,
  });

  beforeEach(() => jest.restoreAllMocks());

  it('creates one bounded structured generation request from recruiter facts', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"title":"Backend Engineer"}' }] } }],
          usageMetadata: { promptTokenCount: 44, candidatesTokenCount: 12 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new GeminiJobPostGenerationAdapter(config);

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

    expect(fetchSpy.mock.calls[0]?.[0]).toContain('/models/gemini-2.5-flash:generateContent');
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body as string) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(body).toEqual(
      expect.objectContaining({
        systemInstruction: { parts: [{ text: 'Return a structured job post.' }] },
        contents: [{ role: 'user', parts: [{ text: 'Create a JD from recruiter form data.' }] }],
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT' },
          temperature: 0.3,
        }),
      }),
    );
  });

  it('keeps an invalid provider response distinct from a retriable outage', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new GeminiJobPostGenerationAdapter(config);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'Return JSON only.',
        prompt: 'Generate a JD.',
        responseSchema: { type: 'OBJECT' },
      }),
    ).rejects.toThrow('AI_INVALID_OUTPUT');
  });

  it('treats Gemini regional restrictions as an unavailable service', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 400, status: 'FAILED_PRECONDITION' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new GeminiJobPostGenerationAdapter(config);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'Return JSON only.',
        prompt: 'Generate a JD.',
        responseSchema: { type: 'OBJECT' },
      }),
    ).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
  });
});
