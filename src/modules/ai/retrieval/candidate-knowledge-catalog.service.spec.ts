import { ServiceUnavailableException } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { CANDIDATE_KNOWLEDGE_CATALOG } from './candidate-knowledge.catalog';
import { CandidateKnowledgeCatalogService } from './candidate-knowledge-catalog.service';

describe('CandidateKnowledgeCatalogService', () => {
  const create = (statuses: OutboxStatus[]) => {
    let sequence = 0;
    const indexer = {
      enqueue: jest.fn().mockImplementation(async () => ({ id: `event-${++sequence}` })),
    };
    const prisma = {
      outboxEvent: {
        findMany: jest.fn().mockImplementation(async () =>
          statuses.map((status, index) => ({
            id: `event-${index + 1}`,
            status,
            attemptCount: index,
          })),
        ),
      },
    };
    return {
      service: new CandidateKnowledgeCatalogService(indexer as never, prisma as never),
      indexer,
    };
  };

  it('enqueues every reviewed source and accepts only fully processed delivery', async () => {
    const { service, indexer } = create(
      CANDIDATE_KNOWLEDGE_CATALOG.map(() => OutboxStatus.PROCESSED),
    );

    const queued = await service.enqueueCatalog();
    await expect(service.assertProcessed(queued.eventIds)).resolves.toEqual({
      documentsQueued: CANDIDATE_KNOWLEDGE_CATALOG.length,
      attempts: CANDIDATE_KNOWLEDGE_CATALOG.length * ((CANDIDATE_KNOWLEDGE_CATALOG.length - 1) / 2),
    });
    expect(indexer.enqueue).toHaveBeenCalledTimes(CANDIDATE_KNOWLEDGE_CATALOG.length);
  });

  it('fails closed when even one catalog event is not processed', async () => {
    const { service } = create([
      OutboxStatus.PROCESSED,
      OutboxStatus.PENDING,
      ...CANDIDATE_KNOWLEDGE_CATALOG.slice(2).map(() => OutboxStatus.PROCESSED),
    ]);

    await expect(
      service.assertProcessed(CANDIDATE_KNOWLEDGE_CATALOG.map((_, index) => `event-${index + 1}`)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
