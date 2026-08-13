import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
  EmbeddingProviderPort,
  MAX_EMBEDDING_TEXT_LENGTH,
} from '../ai/ports/embedding-provider.port';
import {
  buildCvText,
  buildJobText,
  CV_TEXT_INCLUDE,
  CvVersionForText,
  JOB_TEXT_INCLUDE,
} from './screening-text';

export type EmbeddingResult = {
  vector: number[];
  text: string;
  modelName: string;
  updatedAt: Date;
};

export type RankedCvEmbedding = {
  cvVersionId: string;
  semanticScore: number;
  text: string;
  updatedAt: Date;
};

type CvVersionForEmbedding = CvVersionForText;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProviderPort,
  ) {}

  async createEmbedding(text: string): Promise<number[]> {
    const normalizedText = this.normalizeForEmbedding(text);
    if (!normalizedText) {
      throw new BadRequestException('Cannot create embedding from empty text');
    }
    if (!this.embeddingProvider.isConfigured())
      throw new BadRequestException('Embedding service is not configured on the server');
    const result = await this.embeddingProvider.createEmbedding(normalizedText);
    if (result.modelName !== EMBEDDING_MODEL || result.cacheKey !== EMBEDDING_CACHE_KEY) {
      throw new Error('AI_INVALID_OUTPUT');
    }
    return this.assertVector(result.vector);
  }

  async getOrCreateJobEmbedding(jobPostId: string): Promise<EmbeddingResult> {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: JOB_TEXT_INCLUDE,
    });

    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }

    const embeddingText = buildJobText(jobPost);
    const existing = await this.prisma.jobEmbedding.findUnique({
      where: { jobPostId },
    });

    if (existing?.modelName === EMBEDDING_CACHE_KEY && existing.embeddingText === embeddingText) {
      return {
        vector: this.parseVector(existing.embeddingVector),
        text: existing.embeddingText,
        modelName: existing.modelName,
        updatedAt: existing.updatedAt,
      };
    }

    const vector = await this.createEmbedding(embeddingText);
    const saved = await this.prisma.jobEmbedding.upsert({
      where: { jobPostId },
      update: {
        embeddingText,
        embeddingVector: vector,
        modelName: EMBEDDING_CACHE_KEY,
      },
      create: {
        jobPostId,
        embeddingText,
        embeddingVector: vector,
        modelName: EMBEDDING_CACHE_KEY,
      },
    });
    await this.persistPgVector('job_embeddings', saved.id, vector);

    return {
      vector: this.parseVector(saved.embeddingVector),
      text: saved.embeddingText,
      modelName: saved.modelName,
      updatedAt: saved.updatedAt,
    };
  }

  async getOrCreateCvEmbedding(cvVersionId: string): Promise<EmbeddingResult> {
    const embeddings = await this.getOrCreateCvEmbeddings([cvVersionId], 1);
    const embedding = embeddings.get(cvVersionId);

    if (!embedding) {
      throw new NotFoundException('CV version not found');
    }

    return embedding;
  }

  async getOrCreateCvEmbeddings(
    cvVersionIds: string[],
    concurrency = 5,
  ): Promise<Map<string, EmbeddingResult>> {
    const uniqueCvVersionIds = [...new Set(cvVersionIds)];
    const results = new Map<string, EmbeddingResult>();

    if (uniqueCvVersionIds.length === 0) {
      return results;
    }

    const cvVersions = await this.prisma.cVVersion.findMany({
      where: { id: { in: uniqueCvVersionIds } },
      include: CV_TEXT_INCLUDE,
    });

    const existingEmbeddings = await this.prisma.cvEmbedding.findMany({
      where: { cvVersionId: { in: cvVersions.map((cvVersion) => cvVersion.id) } },
    });
    const existingByCvVersionId = new Map(
      existingEmbeddings.map((embedding) => [embedding.cvVersionId, embedding]),
    );

    const staleCvVersions: Array<{
      cvVersion: CvVersionForEmbedding;
      embeddingText: string;
    }> = [];

    for (const cvVersion of cvVersions) {
      const embeddingText = buildCvText(cvVersion);
      const existing = existingByCvVersionId.get(cvVersion.id);

      if (existing?.modelName === EMBEDDING_CACHE_KEY && existing.embeddingText === embeddingText) {
        results.set(cvVersion.id, {
          vector: this.parseVector(existing.embeddingVector),
          text: existing.embeddingText,
          modelName: existing.modelName,
          updatedAt: existing.updatedAt,
        });
        continue;
      }

      staleCvVersions.push({ cvVersion, embeddingText });
    }

    await this.mapLimit(staleCvVersions, concurrency, async ({ cvVersion, embeddingText }) => {
      try {
        const candidateProfile = cvVersion.cv.candidateProfile;
        const vector = await this.createEmbedding(embeddingText);
        const saved = await this.prisma.cvEmbedding.upsert({
          where: { cvVersionId: cvVersion.id },
          update: {
            candidateProfileId: candidateProfile.id,
            embeddingText,
            embeddingVector: vector,
            modelName: EMBEDDING_CACHE_KEY,
          },
          create: {
            cvVersionId: cvVersion.id,
            candidateProfileId: candidateProfile.id,
            embeddingText,
            embeddingVector: vector,
            modelName: EMBEDDING_CACHE_KEY,
          },
        });
        await this.persistPgVector('cv_embeddings', saved.id, vector);

        results.set(cvVersion.id, {
          vector: this.parseVector(saved.embeddingVector),
          text: saved.embeddingText,
          modelName: saved.modelName,
          updatedAt: saved.updatedAt,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create embedding for CV version ${cvVersion.id}`,
          this.getErrorStack(error),
        );
      }
    });

    return results;
  }

  async rankCvEmbeddings(
    queryVector: number[],
    cvVersionIds: string[],
    limit: number,
    minScore: number | null,
  ): Promise<RankedCvEmbedding[]> {
    const vector = this.assertVector(queryVector);
    const uniqueCvVersionIds = [...new Set(cvVersionIds)];
    if (uniqueCvVersionIds.length === 0 || limit <= 0) {
      return [];
    }

    try {
      const vectorLiteral = this.toVectorLiteral(vector);
      const scoreFilter =
        minScore === null
          ? Prisma.empty
          : Prisma.sql`AND (1 - ("embedding_pgvector" <=> ${vectorLiteral}::vector)) * 100 >= ${minScore}`;

      const rankingQuery = Prisma.sql`
        SELECT
          "cv_version_id" AS "cvVersionId",
          ((1 - ("embedding_pgvector" <=> ${vectorLiteral}::vector)) * 100)::double precision
            AS "semanticScore",
          "embedding_text" AS "text",
          "updated_at" AS "updatedAt"
        FROM "cv_embeddings"
        WHERE "cv_version_id" IN (${Prisma.join(uniqueCvVersionIds)})
          AND "embedding_pgvector" IS NOT NULL
          ${scoreFilter}
        ORDER BY "embedding_pgvector" <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `;

      const efSearch = String(Math.max(100, limit * 4));
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT set_config('hnsw.ef_search', ${efSearch}, true)`,
        );
        return transaction.$queryRaw<RankedCvEmbedding[]>(rankingQuery);
      });
    } catch (err: unknown) {
      this.logger.warn(
        `pgvector ranking query skipped (${err instanceof Error ? err.message : String(err)}); using JSON embedding fallback`,
      );
      return this.rankCvEmbeddingsFallback(vector, uniqueCvVersionIds, limit, minScore);
    }
  }

  private async rankCvEmbeddingsFallback(
    queryVector: number[],
    uniqueCvVersionIds: string[],
    limit: number,
    minScore: number | null,
  ): Promise<RankedCvEmbedding[]> {
    const embeddings = await this.prisma.cvEmbedding.findMany({
      where: { cvVersionId: { in: uniqueCvVersionIds } },
    });

    return embeddings
      .map((item) => {
        const itemVector = this.parseVector(item.embeddingVector);
        const score = this.cosineSimilarity(queryVector, itemVector) * 100;
        return {
          cvVersionId: item.cvVersionId,
          semanticScore: score,
          text: item.embeddingText,
          updatedAt: item.updatedAt,
        };
      })
      .filter((item) => minScore === null || item.semanticScore >= minScore)
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, limit);
  }

  cosineSimilarity(vectorA: number[], vectorB: number[]) {
    if (!vectorA.length || vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let index = 0; index < vectorA.length; index += 1) {
      const a = vectorA[index];
      const b = vectorB[index];
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async persistPgVector(
    table: 'job_embeddings' | 'cv_embeddings',
    id: string,
    vector: number[],
  ) {
    try {
      const vectorLiteral = this.toVectorLiteral(this.assertVector(vector));
      const tableName = Prisma.raw(`"${table}"`);

      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE ${tableName} SET "embedding_pgvector" = ${vectorLiteral}::vector WHERE "id" = ${id}::uuid`,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `pgvector persistence skipped (${err instanceof Error ? err.message : String(err)}); stored in JSON embedding_vector column`,
      );
    }
  }

  private toVectorLiteral(vector: number[]) {
    return `[${vector.join(',')}]`;
  }

  private assertVector(value: unknown): number[] {
    if (!this.isNumberArray(value) || value.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding vector must contain ${EMBEDDING_DIMENSIONS} finite numbers`);
    }

    return value;
  }

  private normalizeForEmbedding(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EMBEDDING_TEXT_LENGTH);
  }

  private parseVector(value: Prisma.JsonValue): number[] {
    if (!this.isNumberArray(value)) {
      this.logger.warn('Stored embedding vector is invalid; treating similarity as zero');
      return [];
    }

    return value;
  }

  private isNumberArray(value: unknown): value is number[] {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'number' && Number.isFinite(item))
    );
  }

  private async mapLimit<T>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<void>,
  ) {
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await mapper(items[currentIndex], currentIndex);
      }
    });

    await Promise.all(workers);
  }

  private getErrorStack(error: unknown) {
    return error instanceof Error ? error.stack : undefined;
  }
}
