import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from '../../ports/embedding-provider.port';
import { GeminiEmbeddingAdapter } from './gemini-embedding.adapter';

describe('GeminiEmbeddingAdapter', () => {
  const config = new ConfigService({ geminiApiKey: 'test-key' });

  beforeEach(() => jest.restoreAllMocks());

  it('preserves the existing Gemini vector-space contract', async () => {
    const values = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index + 1);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ embedding: { values } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new GeminiEmbeddingAdapter(config).createEmbedding('  Senior Node.js  ');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toContain(
      `/models/${EMBEDDING_MODEL}:embedContent?key=test-key`,
    );
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string') throw new Error('Expected a JSON request body');
    const request = JSON.parse(requestBody) as Record<string, unknown>;
    expect(request).toEqual({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: '  Senior Node.js  ' }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
    expect(request).not.toHaveProperty('taskType');
    expect(result).toEqual(
      expect.objectContaining({ modelName: EMBEDDING_MODEL, cacheKey: EMBEDDING_CACHE_KEY }),
    );
    expect(result.vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...result.vector)).toBeCloseTo(1, 12);
  });

  it('rejects malformed vectors instead of mixing vector spaces', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ embedding: { values: [1, 2, 3] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(new GeminiEmbeddingAdapter(config).createEmbedding('text')).rejects.toThrow(
      'AI_INVALID_OUTPUT',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
