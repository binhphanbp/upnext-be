import { FallbackJobPostGenerationAdapter } from './fallback-job-post-generation.adapter';
import { JobPostGenerationProviderPort } from '../ports/job-post-generation-provider.port';

const request = {
  systemInstruction: 'Return JSON only.',
  prompt: 'Create a JD.',
  responseSchema: { type: 'OBJECT' },
};

function provider(generateStructured: jest.Mock, configured = true): JobPostGenerationProviderPort {
  return {
    modelName: 'test-model',
    isConfigured: () => configured,
    generateStructured,
  };
}

describe('FallbackJobPostGenerationAdapter', () => {
  it.each(['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'])(
    'uses direct Gemini when the private service reports %s',
    async (code) => {
      const primary = provider(jest.fn().mockRejectedValue(new Error(code)));
      const fallbackGenerate = jest.fn().mockResolvedValue({
        value: { title: 'Backend Engineer' },
        inputTokens: 10,
        outputTokens: 5,
        modelName: 'gemini',
      });
      const fallback = provider(fallbackGenerate);
      const adapter = new FallbackJobPostGenerationAdapter(primary, fallback);

      await expect(adapter.generateStructured(request)).resolves.toMatchObject({
        modelName: 'gemini',
      });
      expect(fallbackGenerate).toHaveBeenCalledWith(request);
    },
  );

  it('does not hide malformed output behind a fallback generation', async () => {
    const primary = provider(jest.fn().mockRejectedValue(new Error('AI_INVALID_OUTPUT')));
    const fallbackGenerate = jest.fn();
    const fallback = provider(fallbackGenerate);
    const adapter = new FallbackJobPostGenerationAdapter(primary, fallback);

    await expect(adapter.generateStructured(request)).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });
});
