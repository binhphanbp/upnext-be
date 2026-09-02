import { ConflictException } from '@nestjs/common';
import { AiKnowledgeDocumentStatus, AiKnowledgeSourceType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { redact } from '../context/pii-redactor';
import { CandidateKnowledgeIndexerService } from './candidate-knowledge-indexer.service';

describe('CandidateKnowledgeIndexerService', () => {
  const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));

  const input = {
    sourceType: AiKnowledgeSourceType.CANDIDATE_GUIDE,
    locale: 'vi' as const,
    title: 'CV guide',
    canonicalUrl: '/candidate/ai?guide=cv',
    sourceVersion: '2026-09-03',
    content: 'Email test@example.com\n\nDùng thành tựu có thể đo lường.',
  };

  const build = (existing: unknown = null, superseded: { id: string }[] = []) => {
    const prisma = {
      aiKnowledgeDocument: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: 'document-1' }),
        update: jest.fn().mockResolvedValue({ id: 'document-1' }),
        findMany: jest.fn().mockResolvedValue(superseded),
        updateMany: jest.fn().mockResolvedValue({ count: superseded.length }),
      },
      aiKnowledgeChunk: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'chunk-1' }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const embeddings = {
      isConfigured: () => true,
      createEmbedding: jest.fn().mockResolvedValue({
        vector,
        cacheKey: 'gemini-embedding-001:768:l2-v1',
      }),
    };
    const outbox = { enqueue: jest.fn() };
    return {
      service: new CandidateKnowledgeIndexerService(prisma as never, embeddings, outbox as never),
      prisma,
      embeddings,
    };
  };

  it('redacts before embedding and only publishes after all vectors are written', async () => {
    const { service, prisma, embeddings } = build();

    await expect(service.upsertPublished(input)).resolves.toEqual({
      documentId: 'document-1',
      chunkCount: 1,
    });

    expect(embeddings.createEmbedding).toHaveBeenCalledWith(
      expect.not.stringContaining('test@example.com'),
    );
    expect(prisma.aiKnowledgeDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AiKnowledgeDocumentStatus.DRAFT }),
      }),
    );
    expect(prisma.aiKnowledgeChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.aiKnowledgeDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'document-1' },
        data: expect.objectContaining({ status: AiKnowledgeDocumentStatus.PUBLISHED }),
      }),
    );
  });

  it('does not re-embed an already published, unchanged document', async () => {
    const checksum = createHash('sha256').update(redact(input.content).text.trim()).digest('hex');
    const { service, prisma, embeddings } = build({
      id: 'document-1',
      status: AiKnowledgeDocumentStatus.PUBLISHED,
      contentChecksum: checksum,
    });
    prisma.aiKnowledgeChunk.count.mockResolvedValue(2);
    await expect(service.upsertPublished(input)).resolves.toEqual({
      documentId: 'document-1',
      chunkCount: 2,
    });

    expect(embeddings.createEmbedding).not.toHaveBeenCalled();
    expect(prisma.aiKnowledgeChunk.deleteMany).not.toHaveBeenCalled();
  });

  it('requires a new source version when reviewed content changes', async () => {
    const { service } = build({
      id: 'document-1',
      status: AiKnowledgeDocumentStatus.PUBLISHED,
      contentChecksum: 'different',
    });

    await expect(service.upsertPublished(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('archives and invalidates only a fully replaced prior version', async () => {
    const { service, prisma } = build(null, [{ id: 'old-document' }]);

    await service.upsertPublished(input);

    expect(prisma.aiKnowledgeDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['old-document'] } },
        data: { status: AiKnowledgeDocumentStatus.ARCHIVED },
      }),
    );
    expect(prisma.aiKnowledgeChunk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentId: { in: ['old-document'] }, isValid: true } }),
    );
  });
});
