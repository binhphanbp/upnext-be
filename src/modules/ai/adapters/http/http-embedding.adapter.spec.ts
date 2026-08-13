import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_NORMALIZATION,
} from '../../ports/embedding-provider.port';
import { HttpEmbeddingAdapter } from './http-embedding.adapter';

describe('HttpEmbeddingAdapter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the narrow embedding scope and validates vector-space metadata', async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
      index === 0 ? 1 : 0,
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vector,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        normalization: EMBEDDING_NORMALIZATION,
        cacheKey: EMBEDDING_CACHE_KEY,
      }),
    });
    const config = {
      get: jest.fn(
        (key: string) =>
          (
            ({
              aiServiceUrl: 'http://upnext-ai:8000',
              aiInternalJwtSecret: 's'.repeat(32),
              appEnv: 'test',
              aiEmbeddingServiceTimeoutMs: 20_000,
            }) as Record<string, unknown>
          )[key],
      ),
    } as unknown as ConfigService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('service-token'),
    } as unknown as JwtService;
    const adapter = new HttpEmbeddingAdapter(config, jwt);
    await expect(adapter.createEmbedding('candidate profile')).resolves.toEqual({
      vector,
      modelName: EMBEDDING_MODEL,
      cacheKey: EMBEDDING_CACHE_KEY,
    });
    expect((jwt.signAsync as jest.Mock).mock.calls[0]).toEqual([
      expect.objectContaining({ scope: 'embedding:invoke' }),
      expect.any(Object),
    ]);
  });

  it('fails closed when the remote service changes vector space', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vector: Array(768).fill(0),
        model: 'different-model',
        dimensions: 768,
        normalization: 'l2-v1',
        cacheKey: 'different',
      }),
    });
    const config = {
      get: jest.fn(
        (key: string) =>
          (
            ({
              aiServiceUrl: 'http://upnext-ai:8000',
              aiInternalJwtSecret: 's'.repeat(32),
            }) as Record<string, unknown>
          )[key],
      ),
    } as unknown as ConfigService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('service-token'),
    } as unknown as JwtService;
    await expect(new HttpEmbeddingAdapter(config, jwt).createEmbedding('text')).rejects.toThrow(
      'AI_INVALID_OUTPUT',
    );
  });
});
