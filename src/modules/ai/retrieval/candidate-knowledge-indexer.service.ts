import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { AiKnowledgeDocumentStatus, AiKnowledgeSourceType, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { redact } from '../context/pii-redactor';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_PROVIDER,
  EmbeddingProviderPort,
} from '../ports/embedding-provider.port';

const INDEX_VERSION = 'candidate-knowledge-v1';
const MAX_CHUNK_LENGTH = 2_000;

export type CandidateKnowledgeUpsert = {
  sourceType: AiKnowledgeSourceType;
  locale: 'vi' | 'en';
  title: string;
  canonicalUrl: string;
  sourceVersion: string;
  content: string;
  effectiveAt?: Date;
  reviewAt?: Date;
  expiresAt?: Date;
};

/** Builds a reviewable, redacted vector index for the candidate knowledge corpus. */
@Injectable()
export class CandidateKnowledgeIndexerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProviderPort,
    private readonly outbox: OutboxService,
  ) {}

  async enqueue(input: CandidateKnowledgeUpsert) {
    const content = redact(input.content).text.trim();
    if (!input.title.trim() || !content)
      throw new BadRequestException('Knowledge title and content are required');
    const dedupeKey = `candidate-knowledge:index:${this.hash(`${input.sourceType}:${input.canonicalUrl}:${input.sourceVersion}:${content}`)}`;
    return this.outbox.enqueue({
      aggregateType: 'ai_knowledge_document',
      aggregateId: randomUUID(),
      eventType: 'candidate_knowledge.index',
      dedupeKey,
      payload: { ...input, content },
    });
  }

  async upsertPublished(input: CandidateKnowledgeUpsert) {
    const title = input.title.trim();
    const content = redact(input.content).text.trim();
    if (!title || !content)
      throw new BadRequestException('Knowledge title and content are required');
    if (!this.embeddings.isConfigured())
      throw new BadRequestException('Embedding service is not configured');

    const chunks = this.chunk(content);
    const checksum = this.hash(content);
    const identity = {
      sourceType_canonicalUrl_sourceVersion: {
        sourceType: input.sourceType,
        canonicalUrl: input.canonicalUrl,
        sourceVersion: input.sourceVersion,
      },
    };
    const existing = await this.prisma.aiKnowledgeDocument.findUnique({
      where: identity,
      select: { id: true, status: true, contentChecksum: true },
    });

    // A version names immutable reviewed content. Re-indexing a changed body
    // under the same version used to invalidate valid chunks and then collide
    // with the `(document, ordinal, indexVersion)` uniqueness constraint.
    if (existing && existing.contentChecksum !== checksum) {
      throw new ConflictException('Knowledge content changed; publish a new sourceVersion');
    }

    if (existing?.status === AiKnowledgeDocumentStatus.ARCHIVED) {
      // An out-of-order retry for a superseded source must never resurrect it.
      return { documentId: existing.id, chunkCount: 0 };
    }

    const document = existing
      ? existing
      : await this.prisma.aiKnowledgeDocument.create({
          data: {
            sourceType: input.sourceType,
            locale: input.locale,
            title,
            canonicalUrl: input.canonicalUrl,
            sourceVersion: input.sourceVersion,
            contentChecksum: checksum,
            // A draft is invisible to retrieval while embeddings are generated.
            status: AiKnowledgeDocumentStatus.DRAFT,
            effectiveAt: input.effectiveAt,
            reviewAt: input.reviewAt,
            expiresAt: input.expiresAt,
          },
          select: { id: true },
        });

    const validChunks = await this.prisma.aiKnowledgeChunk.count({
      where: { documentId: document.id, isValid: true, embeddingModel: EMBEDDING_CACHE_KEY },
    });
    if (existing?.status === AiKnowledgeDocumentStatus.PUBLISHED && validChunks > 0) {
      return { documentId: document.id, chunkCount: validChunks };
    }

    // A failed indexing attempt leaves a DRAFT. Delete only its unpublished
    // partial chunks before retrying; published documents are never blanked.
    await this.prisma.aiKnowledgeChunk.deleteMany({ where: { documentId: document.id } });

    for (const [ordinal, chunk] of chunks.entries()) {
      const embedded = await this.embeddings.createEmbedding(chunk);
      if (
        embedded.cacheKey !== EMBEDDING_CACHE_KEY ||
        embedded.vector.length !== EMBEDDING_DIMENSIONS
      ) {
        throw new Error('Embedding vector space is incompatible');
      }
      const record = await this.prisma.aiKnowledgeChunk.create({
        data: {
          id: randomUUID(),
          documentId: document.id,
          ordinal,
          contentRedacted: chunk,
          lexicalText: chunk,
          tokenCount: this.tokenEstimate(chunk),
          contentChecksum: this.hash(chunk),
          embeddingModel: EMBEDDING_CACHE_KEY,
          indexVersion: INDEX_VERSION,
        },
        select: { id: true },
      });
      const literal = `[${embedded.vector.join(',')}]`;
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE "ai_knowledge_chunks" SET "embedding_pgvector" = ${literal}::vector WHERE "id" = ${record.id}::uuid`,
      );
    }

    await this.prisma.aiKnowledgeDocument.update({
      where: { id: document.id },
      data: {
        title,
        locale: input.locale,
        status: AiKnowledgeDocumentStatus.PUBLISHED,
        effectiveAt: input.effectiveAt ?? null,
        reviewAt: input.reviewAt ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });

    // Retire prior versions only after the replacement is fully indexed. This
    // guarantees that a transient embedding failure leaves the last reviewed
    // source searchable instead of turning general guidance into an empty RAG.
    const superseded = await this.prisma.aiKnowledgeDocument.findMany({
      where: {
        sourceType: input.sourceType,
        canonicalUrl: input.canonicalUrl,
        id: { not: document.id },
        status: AiKnowledgeDocumentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (superseded.length) {
      const ids = superseded.map((item) => item.id);
      await this.prisma.aiKnowledgeDocument.updateMany({
        where: { id: { in: ids } },
        data: { status: AiKnowledgeDocumentStatus.ARCHIVED },
      });
      await this.prisma.aiKnowledgeChunk.updateMany({
        where: { documentId: { in: ids }, isValid: true },
        data: { isValid: false, invalidatedAt: new Date() },
      });
    }
    return { documentId: document.id, chunkCount: chunks.length };
  }

  private chunk(content: string) {
    const chunks: string[] = [];
    let current = '';
    for (const paragraph of content
      .split(/\n\s*\n/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      if (current && current.length + paragraph.length + 2 > MAX_CHUNK_LENGTH) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private tokenEstimate(value: string) {
    return Math.ceil(value.length / 4);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
