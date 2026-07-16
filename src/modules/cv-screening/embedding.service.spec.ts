import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

jest.mock('pgvector', () => ({
  __esModule: true,
  default: {
    toSql: (value: number[]) => `[${value.join(',')}]`,
  },
}));

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

  it('returns pgvector hybrid ranking rows from the database', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([
      {
        applicationId: 'eb908506-dde7-4b56-8099-f6d8e532bb32',
        semanticScore: 82.125,
        skillMatchScore: 100,
        retrievalScore: 84.806,
      },
    ]);
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
        callback({ $executeRaw: executeRaw, $queryRaw: queryRaw }),
      ),
    } as unknown as PrismaService;
    const service = new EmbeddingService(prisma, {} as ConfigService);

    const result = await service.rankApplications(
      '2a8e96c8-d0af-4fef-8db3-eb5e2a0a236a',
      Array.from({ length: 768 }, () => 1 / Math.sqrt(768)),
      50,
      500,
      60,
    );

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        applicationId: 'eb908506-dde7-4b56-8099-f6d8e532bb32',
        semanticScore: 82.13,
        skillMatchScore: 100,
        retrievalScore: 84.81,
      },
    ]);
  });

  it('does not query pgvector when no applications need ranking', async () => {
    const transaction = jest.fn();
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new EmbeddingService(prisma, {} as ConfigService);

    await expect(service.rankApplications('job-id', [], 0, 0, null)).resolves.toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });
});
