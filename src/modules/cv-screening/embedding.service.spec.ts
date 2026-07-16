import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('requests a 768-dimensional Gemini embedding and normalizes it', async () => {
    const values = Array.from({ length: 768 }, (_, index) => index + 1);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values } }),
    });
    global.fetch = fetchMock;

    const configService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    } as unknown as ConfigService;
    const service = new EmbeddingService({} as PrismaService, configService);

    const embedding = await service.createEmbedding('Senior Java backend engineer');

    expect(embedding).toHaveLength(768);
    expect(Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 8);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    if (typeof request.body !== 'string') {
      throw new Error('Expected Gemini request body to be a JSON string');
    }
    const body = JSON.parse(request.body) as { outputDimensionality: number };
    expect(body.outputDimensionality).toBe(768);
  });

  it('calculates cosine similarity directly from JSON embedding arrays', () => {
    const service = new EmbeddingService({} as PrismaService, {} as ConfigService);

    expect(service.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(service.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(service.cosineSimilarity([], [])).toBe(0);
  });
});
