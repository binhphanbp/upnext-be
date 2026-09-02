import { AiKnowledgeSourceType } from '@prisma/client';
import { CandidateKnowledgeIndexerService } from './candidate-knowledge-indexer.service';

describe('CandidateKnowledgeIndexerService', () => {
  const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));

  it('redacts before embedding, invalidates prior chunks, and writes pgvector', async () => {
    const prisma = {
      aiKnowledgeDocument: { upsert: jest.fn().mockResolvedValue({ id: 'document-1' }) },
      aiKnowledgeChunk: {
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
    const service = new CandidateKnowledgeIndexerService(prisma as never, embeddings);

    await expect(
      service.upsertPublished({
        sourceType: AiKnowledgeSourceType.CANDIDATE_GUIDE,
        locale: 'vi',
        title: 'CV guide',
        canonicalUrl: '/guides/cv',
        sourceVersion: 'v1',
        content: 'Email test@example.com\n\nDùng thành tựu có thể đo lường.',
      }),
    ).resolves.toEqual({ documentId: 'document-1', chunkCount: 1 });

    expect(embeddings.createEmbedding).toHaveBeenCalledWith(
      expect.not.stringContaining('test@example.com'),
    );
    expect(prisma.aiKnowledgeChunk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentId: 'document-1', isValid: true } }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
