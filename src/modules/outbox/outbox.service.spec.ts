import { OutboxStatus } from '@prisma/client';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  const params = {
    aggregateType: 'ai_knowledge_document',
    aggregateId: '11111111-1111-4111-8111-111111111111',
    eventType: 'candidate_knowledge.index',
    dedupeKey: 'candidate-knowledge:index:test',
    payload: { source: 'test' },
  };

  it('recovers an explicitly re-enqueued terminal failure', async () => {
    const client = {
      outboxEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'event-1', status: OutboxStatus.FAILED }),
        update: jest.fn().mockResolvedValue({ id: 'event-1', status: OutboxStatus.PENDING }),
      },
    };
    const service = new OutboxService(client as never);

    await expect(service.enqueue(params, client as never)).resolves.toMatchObject({
      status: OutboxStatus.PENDING,
    });

    expect(client.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({ status: OutboxStatus.PENDING, attemptCount: 0 }),
      }),
    );
  });

  it('keeps an already completed event exactly once', async () => {
    const client = {
      outboxEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'event-1', status: OutboxStatus.PROCESSED }),
        update: jest.fn(),
      },
    };
    const service = new OutboxService(client as never);

    await expect(service.enqueue(params, client as never)).resolves.toMatchObject({
      status: OutboxStatus.PROCESSED,
    });
    expect(client.outboxEvent.update).not.toHaveBeenCalled();
  });
});
