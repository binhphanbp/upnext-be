import { ConfigService } from '@nestjs/config';
import { AiKnowledgeSourceType, OutboxStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CandidateKnowledgeIndexerService } from '../src/modules/ai/retrieval/candidate-knowledge-indexer.service';
import { CandidateKnowledgeRetrievalService } from '../src/modules/ai/retrieval/candidate-knowledge-retrieval.service';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EmbeddingProviderPort,
} from '../src/modules/ai/ports/embedding-provider.port';
import { OutboxProcessorService } from '../src/modules/outbox/outbox-processor.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A disposable-database verification for the candidate assistant's RAG path.
 *
 * It uses a deterministic local embedding rather than a provider credential,
 * then verifies the production services in order: enqueue, lease/processor,
 * redacted pgvector indexing, retrieval, and retrieval audit persistence.
 * Never run this against a shared database.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  assertLocalDatabase(databaseUrl);

  const runId = randomUUID();
  const sourceVersion = `local-e2e-${runId}`;
  const email = `candidate-${runId}@local.test`;
  const vector = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    () => 1 / Math.sqrt(EMBEDDING_DIMENSIONS),
  );
  const config = {
    getOrThrow: <T>() => databaseUrl as T,
  } as unknown as ConfigService;
  const embeddings: EmbeddingProviderPort = {
    isConfigured: () => true,
    createEmbedding: async () => ({
      vector,
      modelName: 'local-e2e',
      cacheKey: EMBEDDING_CACHE_KEY,
    }),
  };
  const prisma = new PrismaService(config);
  const outbox = new OutboxService(prisma);
  const indexer = new CandidateKnowledgeIndexerService(prisma, embeddings, outbox);
  const retriever = new CandidateKnowledgeRetrievalService(prisma, embeddings);
  const processor = new OutboxProcessorService(
    prisma,
    { createNotification: async () => undefined } as never,
    indexer,
  );

  let candidateProfileId: string | undefined;
  let documentId: string | undefined;
  let eventId: string | undefined;

  try {
    await prisma.onModuleInit();
    const account = await prisma.candidateAccount.create({
      data: {
        fullName: 'Candidate local E2E',
        email,
        profile: { create: {} },
      },
      select: { profile: { select: { id: true } } },
    });
    if (!account.profile) throw new Error('Candidate profile was not created');
    candidateProfileId = account.profile.id;

    const event = await indexer.enqueue({
      sourceType: AiKnowledgeSourceType.CANDIDATE_GUIDE,
      locale: 'vi',
      title: 'Hướng dẫn ứng tuyển an toàn',
      canonicalUrl: `https://upnext.local/e2e/${runId}`,
      sourceVersion,
      content:
        'Khi ứng tuyển, hãy kiểm tra mô tả công việc và chuẩn bị CV phù hợp. Liên hệ giaothu@example.com hoặc 0912 345 678 để thử redaction.',
    });
    eventId = event.id;
    const serializedPayload = JSON.stringify(event.payload);
    if (
      serializedPayload.includes('giaothu@example.com') ||
      serializedPayload.includes('0912 345 678')
    ) {
      throw new Error('PII was stored in the candidate-knowledge queue payload');
    }

    await processor.processBatch();
    const processedEvent = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    if (processedEvent.status !== OutboxStatus.PROCESSED || processedEvent.lockedAt !== null) {
      throw new Error(`Candidate-knowledge event was not processed: ${processedEvent.status}`);
    }

    const document = await prisma.aiKnowledgeDocument.findFirstOrThrow({
      where: { sourceVersion },
      select: { id: true },
    });
    documentId = document.id;
    const chunks = await prisma.aiKnowledgeChunk.findMany({
      where: { documentId },
      select: { contentRedacted: true },
    });
    if (chunks.length !== 1 || chunks[0].contentRedacted.includes('giaothu@example.com')) {
      throw new Error('Candidate-knowledge chunk was not safely redacted');
    }

    const results = await retriever.search({
      candidateProfileId,
      query: 'Làm sao chuẩn bị CV khi ứng tuyển?',
      locale: 'vi',
    });
    if (
      results.length !== 1 ||
      results[0].documentId !== documentId ||
      results[0].excerpt.includes('giaothu@example.com')
    ) {
      throw new Error('Candidate-knowledge pgvector retrieval returned an invalid result');
    }

    const audit = await prisma.aiRetrievalRun.findFirstOrThrow({
      where: { candidateProfileId },
      include: { results: true },
    });
    if (
      audit.status !== 'completed' ||
      audit.results.length !== 1 ||
      audit.queryHash.includes('chuẩn bị')
    ) {
      throw new Error('Candidate-knowledge retrieval audit was not persisted safely');
    }

    console.log(
      JSON.stringify({
        queue: processedEvent.status,
        chunks: chunks.length,
        retrievalResults: results.length,
        audit: audit.status,
      }),
    );
  } finally {
    try {
      if (candidateProfileId) {
        await prisma.candidateProfile.delete({ where: { id: candidateProfileId } });
      }
    } finally {
      try {
        if (documentId) {
          await prisma.aiKnowledgeDocument.delete({ where: { id: documentId } });
        }
      } finally {
        try {
          if (eventId) {
            await prisma.outboxEvent.delete({ where: { id: eventId } });
          }
        } finally {
          await prisma.onModuleDestroy();
        }
      }
    }
  }
}

function assertLocalDatabase(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('verify:candidate-knowledge-rag only accepts a local disposable database');
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
