import { FallbackLlmAdapter } from './fallback-llm.adapter';
import { LlmProviderPort } from '../../ports/llm-provider.port';

function provider(overrides: Partial<LlmProviderPort>): LlmProviderPort {
  return {
    modelName: 'test-model',
    isConfigured: () => true,
    generateStructured: jest.fn(),
    streamText: jest.fn(),
    ...overrides,
  };
}

describe('FallbackLlmAdapter', () => {
  it('uses direct Gemini only when the private gateway fails before producing a result', async () => {
    const primary = provider({
      generateStructured: jest.fn().mockRejectedValue(new Error('AI_SERVICE_UNAVAILABLE')),
    });
    const fallbackGenerate = jest
      .fn()
      .mockResolvedValue({ value: { ok: true }, inputTokens: 1, outputTokens: 1 });
    const fallback = provider({ generateStructured: fallbackGenerate });
    const adapter = new FallbackLlmAdapter(primary, fallback);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'x',
        messages: [{ role: 'user', text: 'x' }],
        responseSchema: {},
      }),
    ).resolves.toEqual({ value: { ok: true }, inputTokens: 1, outputTokens: 1 });
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not hide invalid requests or invalid model output behind a fallback', async () => {
    const primary = provider({
      generateStructured: jest.fn().mockRejectedValue(new Error('AI_INVALID_OUTPUT')),
    });
    const fallbackGenerate = jest.fn();
    const fallback = provider({ generateStructured: fallbackGenerate });
    const adapter = new FallbackLlmAdapter(primary, fallback);

    await expect(
      adapter.generateStructured({
        systemInstruction: 'x',
        messages: [{ role: 'user', text: 'x' }],
        responseSchema: {},
      }),
    ).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });
});
