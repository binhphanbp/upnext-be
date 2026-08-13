import { ConfigService } from '@nestjs/config';
import { GeminiLlmAdapter } from './gemini-llm.adapter';

describe('GeminiLlmAdapter', () => {
  const config = new ConfigService({ geminiApiKey: 'test-key' });

  beforeEach(() => jest.restoreAllMocks());

  const request = {
    systemInstruction: 'Return JSON only.',
    messages: [{ role: 'user' as const, text: 'Hello' }],
    responseSchema: { type: 'object' },
  };

  it('maps Google FAILED_PRECONDITION to an unavailable service, not invalid output', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'User location is not supported for the API use.',
            status: 'FAILED_PRECONDITION',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new GeminiLlmAdapter(config);

    await expect(adapter.generateStructured(request)).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
  });

  it('keeps genuine malformed structured requests distinct from service availability', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new GeminiLlmAdapter(config);

    await expect(adapter.generateStructured(request)).rejects.toThrow('AI_INVALID_OUTPUT');
  });

  it('uses the quality model for controlled quality structured requests', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const adapter = new GeminiLlmAdapter(config);

    await expect(adapter.generateStructured({ ...request, modelTier: 'quality' })).resolves.toEqual(
      expect.objectContaining({ value: { ok: true }, modelName: 'gemini-2.5-flash' }),
    );
    expect(fetchSpy.mock.calls[0]?.[0]).toContain('/models/gemini-2.5-flash:generateContent');
  });
});
