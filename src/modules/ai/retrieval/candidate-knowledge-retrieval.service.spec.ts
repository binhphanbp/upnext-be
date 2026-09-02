import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CandidateKnowledgeRetrievalService } from './candidate-knowledge-retrieval.service';

describe('CandidateKnowledgeRetrievalService', () => {
  const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));

  const buildService = (overrides?: { configured?: boolean; queryError?: boolean }) => {
    const prisma = {
      $queryRaw: jest.fn().mockImplementation(() => {
        if (overrides?.queryError) throw new Error('vector extension missing');
        return [
          {
            chunkId: 'chunk-1',
            documentId: 'document-1',
            title: 'Hướng dẫn CV',
            canonicalUrl: '/guides/cv',
            sourceVersion: 'v1',
            excerpt: 'Nội dung đã redaction',
            semanticScore: 0.9,
            lexicalScore: 0.2,
            score: 0.69,
          },
        ];
      }),
      aiRetrievalRun: { create: jest.fn().mockResolvedValue({ id: 'run-1' }) },
      aiRetrievalResult: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiKnowledgeDocument: { findFirst: jest.fn() },
    };
    const embeddings = {
      isConfigured: () => overrides?.configured !== false,
      createEmbedding: jest.fn().mockResolvedValue({
        vector,
        modelName: 'gemini-embedding-001',
        cacheKey: 'gemini-embedding-001:768:l2-v1',
      }),
    };
    return { service: new CandidateKnowledgeRetrievalService(prisma as never, embeddings), prisma };
  };

  it('retrieves candidate knowledge and persists only hashes in the audit run', async () => {
    const { service, prisma } = buildService();
    await expect(
      service.search({
        candidateProfileId: 'candidate-1',
        query: '  cải thiện CV  ',
        locale: 'vi',
      }),
    ).resolves.toHaveLength(1);

    expect(prisma.aiRetrievalRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          corpus: 'candidate_knowledge',
          queryHash: expect.not.stringContaining('cải thiện'),
          resultCount: 1,
        }),
      }),
    );
    expect(prisma.aiRetrievalResult.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ chunkId: 'chunk-1', rank: 1 })] }),
    );
  });

  it('fails closed instead of falling back to JSON similarity', async () => {
    const { service, prisma } = buildService({ queryError: true });
    await expect(
      service.search({ candidateProfileId: 'candidate-1', query: 'CV', locale: 'vi' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.aiRetrievalRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', resultCount: 0 }),
      }),
    );
  });

  it('rejects empty prompts before embedding or database access', async () => {
    const { service } = buildService();
    await expect(
      service.search({ candidateProfileId: 'candidate-1', query: '   ', locale: 'vi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens only a currently published source and returns its redacted chunks in order', async () => {
    const { service, prisma } = buildService();
    prisma.aiKnowledgeDocument.findFirst.mockResolvedValue({
      id: 'document-1',
      locale: 'vi',
      title: 'Hướng dẫn CV',
      sourceVersion: '2026-09-03',
      effectiveAt: new Date('2026-09-03T00:00:00.000Z'),
      reviewAt: new Date('2026-12-03T00:00:00.000Z'),
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
      chunks: [{ contentRedacted: 'Phần một.' }, { contentRedacted: 'Phần hai.' }],
    });

    await expect(service.getPublishedSource('document-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'document-1',
        sourceVersion: '2026-09-03',
        content: 'Phần một.\n\nPhần hai.',
      }),
    );
    expect(prisma.aiKnowledgeDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ audience: 'CANDIDATE', status: 'PUBLISHED' }),
      }),
    );
  });

  it('does not expose an archived, expired, or otherwise unavailable source', async () => {
    const { service, prisma } = buildService();
    prisma.aiKnowledgeDocument.findFirst.mockResolvedValue(null);

    await expect(service.getPublishedSource('document-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
