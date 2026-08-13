import { FallbackJobPostExtractionAdapter } from './fallback-job-post-extraction.adapter';
import { JobPostExtractionProviderPort } from '../ports/job-post-extraction-provider.port';

const request = {
  systemInstruction: 'Return JSON only.',
  prompt: 'Extract this JD.',
  responseSchema: { type: 'OBJECT' },
};

function provider(extractStructured: jest.Mock, configured = true): JobPostExtractionProviderPort {
  return {
    modelName: 'test-model',
    isConfigured: () => configured,
    extractStructured,
  };
}

describe('FallbackJobPostExtractionAdapter', () => {
  it.each(['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'])(
    'uses direct Gemini when the private service reports %s',
    async (code) => {
      const primary = provider(jest.fn().mockRejectedValue(new Error(code)));
      const fallbackExtract = jest.fn().mockResolvedValue({
        value: { title: 'Backend Engineer' },
        inputTokens: 10,
        outputTokens: 5,
        modelName: 'gemini',
      });
      const fallback = provider(fallbackExtract);
      const adapter = new FallbackJobPostExtractionAdapter(primary, fallback);

      await expect(adapter.extractStructured(request)).resolves.toMatchObject({
        modelName: 'gemini',
      });
      expect(fallbackExtract).toHaveBeenCalledWith(request);
    },
  );

  it('does not hide malformed output behind a fallback generation', async () => {
    const primary = provider(jest.fn().mockRejectedValue(new Error('AI_INVALID_OUTPUT')));
    const fallbackExtract = jest.fn();
    const fallback = provider(fallbackExtract);
    const adapter = new FallbackJobPostExtractionAdapter(primary, fallback);

    await expect(adapter.extractStructured(request)).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallbackExtract).not.toHaveBeenCalled();
  });
});
