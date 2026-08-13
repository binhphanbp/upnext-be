import { EmbeddingProviderPort } from '../../ports/embedding-provider.port';
import { FallbackEmbeddingAdapter } from './fallback-embedding.adapter';

const provider = (createEmbedding: jest.Mock, configured = true): EmbeddingProviderPort => ({
  isConfigured: () => configured,
  createEmbedding,
});

describe('FallbackEmbeddingAdapter', () => {
  it('uses the direct provider only for a recoverable gateway failure', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('AI_SERVICE_UNAVAILABLE'));
    const fallback = jest.fn().mockResolvedValue({
      vector: [1],
      modelName: 'gemini-embedding-001',
      cacheKey: 'gemini-embedding-001:768:l2-v1',
    });
    const adapter = new FallbackEmbeddingAdapter(provider(primary), provider(fallback));

    await expect(adapter.createEmbedding('profile')).resolves.toEqual(
      expect.objectContaining({ modelName: 'gemini-embedding-001' }),
    );
    expect(fallback).toHaveBeenCalledWith('profile', undefined);
  });

  it('does not hide an incompatible vector-space response', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('AI_INVALID_OUTPUT'));
    const fallback = jest.fn();
    const adapter = new FallbackEmbeddingAdapter(provider(primary), provider(fallback));

    await expect(adapter.createEmbedding('profile')).rejects.toThrow('AI_INVALID_OUTPUT');
    expect(fallback).not.toHaveBeenCalled();
  });
});
