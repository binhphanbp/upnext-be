import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OutboxProcessorService } from '../modules/outbox/outbox-processor.service';
import { CandidateKnowledgeCatalogService } from '../modules/ai/retrieval/candidate-knowledge-catalog.service';

/**
 * Release-time, idempotent publisher for the reviewed Candidate Assistant
 * corpus.  It creates durable outbox events first, then processes exactly those
 * events and fails the release step if any document is not indexed.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const catalog = app.get(CandidateKnowledgeCatalogService);
    const processor = app.get(OutboxProcessorService);
    const queued = await catalog.enqueueCatalog();
    await processor.processByIds(queued.eventIds);
    const result = await catalog.waitForProcessed(queued.eventIds);
    Logger.log(
      JSON.stringify({
        status: 'ok',
        catalogVersion: queued.catalogVersion,
        ...result,
      }),
      'CandidateKnowledgeCatalogSync',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  // Nest's exception body is intentionally concise and excludes corpus content.
  console.error(error instanceof Error ? error.message : 'Candidate knowledge sync failed');
  process.exitCode = 1;
});
