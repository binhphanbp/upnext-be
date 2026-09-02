import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_PROVIDER,
  EmbeddingProviderPort,
} from '../ports/embedding-provider.port';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

export type CandidateKnowledgeSearchInput = {
  candidateProfileId: string;
  conversationId?: string;
  query: string;
  locale: 'vi' | 'en';
  limit?: number;
};

export type CandidateKnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  title: string;
  canonicalUrl: string | null;
  sourceVersion: string;
  excerpt: string;
  semanticScore: number;
  lexicalScore: number;
  score: number;
};

type KnowledgeRow = CandidateKnowledgeSearchResult;

/**
 * Candidate-only, fail-closed RAG retrieval for reviewed UpNext knowledge.
 *
 * It intentionally has no JSON cosine fallback: a missing `vector` extension
 * is a deployment/configuration failure, not permission to scan every chunk in
 * application memory. Candidate CV/application facts remain authorised domain
 * tools; they do not enter this shared knowledge corpus.
 */
@Injectable()
export class CandidateKnowledgeRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProviderPort,
  ) {}

  async search(input: CandidateKnowledgeSearchInput): Promise<CandidateKnowledgeSearchResult[]> {
    const query = input.query.replace(/\s+/g, ' ').trim();
    if (!query) throw new BadRequestException('Câu hỏi không được để trống');
    if (!this.embeddings.isConfigured()) {
      throw new ServiceUnavailableException('Embedding service is not configured');
    }

    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const startedAt = Date.now();
    const vector = await this.embeddings.createEmbedding(query);
    this.assertVector(vector.vector);
    if (vector.cacheKey !== EMBEDDING_CACHE_KEY) {
      throw new ServiceUnavailableException('Embedding vector space is incompatible');
    }

    const vectorLiteral = `[${vector.vector.join(',')}]`;
    let results: KnowledgeRow[] = [];
    let status = 'completed';

    try {
      results = await this.prisma.$queryRaw<KnowledgeRow[]>(Prisma.sql`
        WITH candidates AS (
          SELECT
            chunk."id" AS "chunkId",
            document."id" AS "documentId",
            document."title" AS "title",
            document."canonical_url" AS "canonicalUrl",
            document."source_version" AS "sourceVersion",
            left(chunk."content_redacted", 600) AS "excerpt",
            (1 - (chunk."embedding_pgvector" <=> ${vectorLiteral}::vector))::double precision AS "semanticScore",
            ts_rank_cd(to_tsvector('simple', chunk."lexical_text"), plainto_tsquery('simple', ${query}))::double precision AS "lexicalScore"
          FROM "ai_knowledge_chunks" chunk
          INNER JOIN "ai_knowledge_documents" document ON document."id" = chunk."document_id"
          WHERE document."audience" = 'candidate'::"AiKnowledgeAudience"
            AND document."status" = 'published'::"AiKnowledgeDocumentStatus"
            AND document."locale" = ${input.locale}
            AND (document."effective_at" IS NULL OR document."effective_at" <= NOW())
            AND (document."expires_at" IS NULL OR document."expires_at" > NOW())
            AND chunk."is_valid" = true
            AND chunk."embedding_model" = ${EMBEDDING_CACHE_KEY}
            AND chunk."embedding_pgvector" IS NOT NULL
          ORDER BY ((1 - (chunk."embedding_pgvector" <=> ${vectorLiteral}::vector)) * 0.7)
                 + (ts_rank_cd(to_tsvector('simple', chunk."lexical_text"), plainto_tsquery('simple', ${query})) * 0.3) DESC
          LIMIT ${limit}
        )
        SELECT *, ("semanticScore" * 0.7 + "lexicalScore" * 0.3)::double precision AS "score"
        FROM candidates
      `);
    } catch {
      status = 'failed';
      // Do not downgrade to JSON similarity: RAG is unavailable until infra is fixed.
      throw new ServiceUnavailableException('Candidate knowledge retrieval is unavailable');
    } finally {
      await this.recordRun({
        candidateProfileId: input.candidateProfileId,
        conversationId: input.conversationId,
        query,
        locale: input.locale,
        limit,
        latencyMs: Date.now() - startedAt,
        status,
        results,
      });
    }

    return results;
  }

  private async recordRun(input: {
    candidateProfileId: string;
    conversationId?: string;
    query: string;
    locale: string;
    limit: number;
    latencyMs: number;
    status: string;
    results: KnowledgeRow[];
  }) {
    const run = await this.prisma.aiRetrievalRun.create({
      data: {
        candidateProfileId: input.candidateProfileId,
        conversationId: input.conversationId,
        queryHash: this.hash(input.query),
        corpus: 'candidate_knowledge',
        filtersHash: this.hash(`candidate:published:${input.locale}`),
        topK: input.limit,
        latencyMs: input.latencyMs,
        resultCount: input.results.length,
        status: input.status,
      },
      select: { id: true },
    });

    if (input.results.length > 0) {
      await this.prisma.aiRetrievalResult.createMany({
        data: input.results.map((result, index) => ({
          retrievalRunId: run.id,
          chunkId: result.chunkId,
          rank: index + 1,
          semanticScore: result.semanticScore,
        })),
      });
    }
  }

  private assertVector(vector: number[]) {
    if (
      vector.length !== EMBEDDING_DIMENSIONS ||
      vector.some((item) => typeof item !== 'number' || !Number.isFinite(item))
    ) {
      throw new ServiceUnavailableException('Embedding vector is invalid');
    }
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
