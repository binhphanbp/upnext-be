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

  it('ranks CV embeddings in PostgreSQL with pgvector', async () => {
    const ranked = [
      {
        cvVersionId: '5bf8e26f-719d-44e9-89f0-e8f72801df31',
        semanticScore: 91.25,
        text: 'Senior Java engineer',
        updatedAt: new Date('2026-07-19T00:00:00.000Z'),
      },
    ];
    const queryRawMock = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(ranked);
    const transactionMock = jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({ $queryRaw: queryRawMock }),
    );
    const prisma = { $transaction: transactionMock } as unknown as PrismaService;
    const service = new EmbeddingService(prisma, {} as ConfigService);
    const vector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));

    await expect(
      service.rankCvEmbeddings(vector, ['5bf8e26f-719d-44e9-89f0-e8f72801df31'], 10, 70),
    ).resolves.toEqual(ranked);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(2);

    const settingsQuery = queryRawMock.mock.calls[0][0] as { strings: string[] };
    expect(settingsQuery.strings.join(' ')).toContain('hnsw.ef_search');

    const query = queryRawMock.mock.calls[1][0] as { strings: string[] };
    expect(query.strings.join(' ')).toContain('"embedding_pgvector" <=>');
    expect(query.strings.join(' ')).toContain('ORDER BY');
    expect(query.strings.join(' ')).toContain('LIMIT');
  });
});
