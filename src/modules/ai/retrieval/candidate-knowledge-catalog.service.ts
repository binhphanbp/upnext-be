import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CANDIDATE_KNOWLEDGE_CATALOG,
  CANDIDATE_KNOWLEDGE_CATALOG_VERSION,
} from './candidate-knowledge.catalog';
import { CandidateKnowledgeIndexerService } from './candidate-knowledge-indexer.service';

export type CandidateKnowledgeCatalogSync = {
  catalogVersion: string;
  eventIds: string[];
};

/**
 * Queues only first-party, reviewed Candidate Assistant knowledge.  Content is
 * declarative and versioned in Git; this deliberately is not a generic browser
 * ingestion endpoint that could accidentally index unreviewed or private text.
 */
@Injectable()
export class CandidateKnowledgeCatalogService {
  constructor(
    private readonly indexer: CandidateKnowledgeIndexerService,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueCatalog(): Promise<CandidateKnowledgeCatalogSync> {
    const events = await Promise.all(
      CANDIDATE_KNOWLEDGE_CATALOG.map((entry) => this.indexer.enqueue(entry)),
    );
    return {
      catalogVersion: CANDIDATE_KNOWLEDGE_CATALOG_VERSION,
      eventIds: [...new Set(events.map((event) => event.id))],
    };
  }

  async assertProcessed(eventIds: readonly string[]) {
    const events = await this.prisma.outboxEvent.findMany({
      where: { id: { in: [...eventIds] } },
      select: { id: true, status: true, attemptCount: true },
    });
    const byId = new Map(events.map((event) => [event.id, event]));
    const incomplete = eventIds
      .map((id) => byId.get(id))
      .filter((event) => event?.status !== OutboxStatus.PROCESSED);

    if (incomplete.length) {
      throw new ServiceUnavailableException({
        code: 'AI_KNOWLEDGE_INDEXING_PENDING',
        message: 'Candidate knowledge catalog was not fully indexed.',
        eventIds: incomplete.map((event) => event?.id ?? 'missing'),
      });
    }

    return {
      documentsQueued: eventIds.length,
      attempts: events.reduce((total, event) => total + event.attemptCount, 0),
    };
  }

  /**
   * The normal backend cron can claim an event between a release command's
   * enqueue and its targeted worker pass. Wait for that legitimate in-flight
   * delivery instead of reporting a false deployment failure, but still fail
   * closed after a bounded window.
   */
  async waitForProcessed(eventIds: readonly string[], timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        return await this.assertProcessed(eventIds);
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
    }
  }
}
