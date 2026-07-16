import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import pgvector from 'pgvector';
import { PrismaService } from '../../prisma/prisma.service';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_CACHE_KEY = `${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:l2-v1`;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_EMBEDDING_TEXT_LENGTH = 12000;
const HNSW_EF_SEARCH = 160;
const HYBRID_SEMANTIC_WEIGHT = 0.85;
const HYBRID_SKILL_WEIGHT = 0.15;

export type EmbeddingResult = {
  vector: number[];
  text: string;
  modelName: string;
  updatedAt: Date;
};

export type PgVectorRanking = {
  applicationId: string;
  semanticScore: number;
  skillMatchScore: number;
  retrievalScore: number;
};

type PgVectorRankingRow = {
  applicationId: string;
  semanticScore: number;
  skillMatchScore: number;
  retrievalScore: number;
};

type CvVersionForEmbedding = Prisma.CVVersionGetPayload<{
  include: {
    sourceFile: true;
    cv: {
      include: {
        candidateProfile: {
          include: {
            account: { select: { fullName: true; email: true } };
            skills: { include: { skill: true } };
            experiences: true;
            projects: true;
            educations: true;
            certifications: true;
            jobPreference: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createEmbedding(text: string): Promise<number[]> {
    const apiKey = this.configService.get<string>('geminiApiKey')?.trim();
    if (!apiKey) {
      throw new BadRequestException('Gemini API key is not configured on the server');
    }

    const normalizedText = this.normalizeForEmbedding(text);
    if (!normalizedText) {
      throw new BadRequestException('Cannot create embedding from empty text');
    }

    return this.withRetry(async () => {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: {
              parts: [{ text: normalizedText }],
            },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Gemini embedding failed with ${response.status}: ${body}`);
      }

      const data = (await response.json()) as {
        embedding?: { values?: unknown };
      };
      const values = data.embedding?.values;
      if (!this.isNumberArray(values)) {
        throw new Error('Gemini embedding response did not include numeric values');
      }

      return this.normalizeVector(values);
    });
  }

  async getOrCreateJobEmbedding(jobPostId: string): Promise<EmbeddingResult> {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: {
        jobCategory: true,
        employmentType: true,
        experienceLevel: true,
        jobPostSkills: { include: { skill: true } },
        jobPostSpecializations: { include: { specialization: true } },
        jobPostLocations: { include: { jobLocation: true } },
      },
    });

    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }

    const embeddingText = this.buildJobEmbeddingText(jobPost);
    const existing = await this.prisma.jobEmbedding.findUnique({
      where: { jobPostId },
    });

    if (existing?.modelName === EMBEDDING_CACHE_KEY && existing.embeddingText === embeddingText) {
      const vector = this.parseVector(existing.embeddingVector);
      const readyIds = await this.getReadySearchVectorIds('job_embeddings', [existing.id]);
      if (!readyIds.has(existing.id)) {
        await this.updateSearchVector('job_embeddings', existing.id, vector);
      }
      return {
        vector,
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
    await this.updateSearchVector('job_embeddings', saved.id, vector);

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
      include: {
        sourceFile: true,
        cv: {
          include: {
            candidateProfile: {
              include: {
                account: { select: { fullName: true, email: true } },
                skills: { include: { skill: true }, orderBy: { sortOrder: 'asc' } },
                experiences: { orderBy: { sortOrder: 'asc' } },
                projects: { orderBy: { sortOrder: 'asc' } },
                educations: { orderBy: { sortOrder: 'asc' } },
                certifications: { orderBy: { sortOrder: 'asc' } },
                jobPreference: true,
              },
            },
          },
        },
      },
    });

    const existingEmbeddings = await this.prisma.cvEmbedding.findMany({
      where: { cvVersionId: { in: cvVersions.map((cvVersion) => cvVersion.id) } },
    });
    const existingByCvVersionId = new Map(
      existingEmbeddings.map((embedding) => [embedding.cvVersionId, embedding]),
    );
    const readySearchVectorIds = await this.getReadySearchVectorIds(
      'cv_embeddings',
      existingEmbeddings.map((embedding) => embedding.id),
    );

    const staleCvVersions: Array<{
      cvVersion: CvVersionForEmbedding;
      embeddingText: string;
    }> = [];

    for (const cvVersion of cvVersions) {
      const embeddingText = this.buildCvEmbeddingText(cvVersion);
      const existing = existingByCvVersionId.get(cvVersion.id);

      if (existing?.modelName === EMBEDDING_CACHE_KEY && existing.embeddingText === embeddingText) {
        const vector = this.parseVector(existing.embeddingVector);
        if (!readySearchVectorIds.has(existing.id)) {
          await this.updateSearchVector('cv_embeddings', existing.id, vector);
        }
        results.set(cvVersion.id, {
          vector,
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
        await this.updateSearchVector('cv_embeddings', saved.id, vector);

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

  async rankApplications(
    jobPostId: string,
    jobVector: number[],
    limit: number,
    totalApplications: number,
    minScore: number | null,
  ): Promise<PgVectorRanking[]> {
    if (limit <= 0 || totalApplications <= 0) {
      return [];
    }

    const vector = pgvector.toSql(this.assertVector(jobVector));
    if (!vector) {
      throw new Error('Unable to serialize job embedding for pgvector search');
    }

    // Retrieve a wider semantic pool, then re-rank it with deterministic skill
    // coverage. This keeps HNSW fast without allowing a synonym-heavy CV to
    // outrank candidates that explicitly satisfy the required skills.
    const candidatePool = Math.min(totalApplications, Math.max(limit * 4, 200));
    const scoreThreshold = minScore ?? 0;

    const rows = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SET LOCAL hnsw.ef_search = ${Prisma.raw(String(HNSW_EF_SEARCH))}`,
      );
      await transaction.$executeRaw(
        Prisma.sql`SET LOCAL hnsw.iterative_scan = strict_order`,
      );

      return transaction.$queryRaw<PgVectorRankingRow[]>(Prisma.sql`
        WITH nearest AS MATERIALIZED (
          SELECT
            application."id" AS "applicationId",
            GREATEST(
              0.0,
              LEAST(
                1.0,
                1.0 - (cv_embedding."search_vector" <=> ${vector}::vector(768))
              )
            )::double precision AS "semanticSimilarity",
            skill_match."skillSimilarity"::double precision AS "skillSimilarity"
          FROM "applications" AS application
          INNER JOIN "cv_embeddings" AS cv_embedding
            ON cv_embedding."cv_version_id" = application."cv_version_id"
          LEFT JOIN LATERAL (
            SELECT
              CASE
                WHEN COUNT(job_skill."id") = 0 THEN NULL
                ELSE SUM(
                  CASE
                    WHEN candidate_skill."id" IS NULL THEN 0.0
                    WHEN job_skill."min_years_experience" IS NULL THEN 1.0
                    WHEN candidate_skill."years_of_experience" >= job_skill."min_years_experience" THEN 1.0
                    ELSE 0.65
                  END
                ) / COUNT(job_skill."id")
              END AS "skillSimilarity"
            FROM "job_post_skills" AS job_skill
            LEFT JOIN "candidate_skills" AS candidate_skill
              ON candidate_skill."candidate_profile_id" = application."candidate_profile_id"
              AND candidate_skill."skill_id" = job_skill."skill_id"
            WHERE job_skill."job_post_id" = ${jobPostId}::uuid
              AND job_skill."priority" = 'required'
          ) AS skill_match ON TRUE
          WHERE application."job_post_id" = ${jobPostId}::uuid
            AND cv_embedding."model_name" = ${EMBEDDING_CACHE_KEY}
            AND cv_embedding."search_vector" IS NOT NULL
          ORDER BY cv_embedding."search_vector" <=> ${vector}::vector(768)
          LIMIT ${candidatePool}
        ), scored AS (
          SELECT
            "applicationId",
            "semanticSimilarity",
            COALESCE("skillSimilarity", "semanticSimilarity") AS "skillSimilarity",
            CASE
              WHEN "skillSimilarity" IS NULL THEN "semanticSimilarity"
              ELSE
                "semanticSimilarity" * ${HYBRID_SEMANTIC_WEIGHT}
                + "skillSimilarity" * ${HYBRID_SKILL_WEIGHT}
            END AS "retrievalSimilarity"
          FROM nearest
        )
        SELECT
          "applicationId",
          ROUND(("semanticSimilarity" * 100)::numeric, 2)::double precision AS "semanticScore",
          ROUND(("skillSimilarity" * 100)::numeric, 2)::double precision AS "skillMatchScore",
          ROUND(("retrievalSimilarity" * 100)::numeric, 2)::double precision AS "retrievalScore"
        FROM scored
        WHERE "retrievalSimilarity" * 100 >= ${scoreThreshold}
        ORDER BY "retrievalSimilarity" DESC, "semanticSimilarity" DESC
        LIMIT ${limit}
      `);
    });

    return rows.map((row) => ({
      applicationId: row.applicationId,
      semanticScore: this.roundScore(row.semanticScore),
      skillMatchScore: this.roundScore(row.skillMatchScore),
      retrievalScore: this.roundScore(row.retrievalScore),
    }));
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

  private buildJobEmbeddingText(
    jobPost: Prisma.JobPostGetPayload<{
      include: {
        jobCategory: true;
        employmentType: true;
        experienceLevel: true;
        jobPostSkills: { include: { skill: true } };
        jobPostSpecializations: { include: { specialization: true } };
        jobPostLocations: { include: { jobLocation: true } };
      };
    }>,
  ) {
    const skills = jobPost.jobPostSkills
      .map((item) =>
        [
          item.skill.name,
          item.priority ? `priority: ${item.priority}` : '',
          item.minYearsExperience ? `min years: ${item.minYearsExperience.toString()}` : '',
          item.proficiencyLevel ? `level: ${item.proficiencyLevel}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join(', ');

    const specializations = jobPost.jobPostSpecializations
      .map((item) => item.specialization.name)
      .join(', ');
    const locations = jobPost.jobPostLocations
      .map((item) =>
        [
          item.jobLocation.city,
          item.jobLocation.district,
          item.jobLocation.country,
          item.jobLocation.workingModel,
        ]
          .filter(Boolean)
          .join(', '),
      )
      .join('; ');

    return this.compactLines([
      `Job title: ${jobPost.title}`,
      `Category: ${jobPost.jobCategory?.name ?? ''}`,
      `Employment type: ${jobPost.employmentType?.name ?? ''}`,
      `Experience level: ${jobPost.experienceLevel?.name ?? ''}`,
      `Education level: ${jobPost.educationLevel}`,
      `Working days: ${jobPost.workingDays ?? ''}`,
      `Description: ${jobPost.description}`,
      `Requirements: ${jobPost.requirements ?? ''}`,
      `Benefits: ${jobPost.benefits ?? ''}`,
      `Required skills: ${skills}`,
      `Specializations: ${specializations}`,
      `Locations: ${locations}`,
    ]);
  }

  private buildCvEmbeddingText(
    cvVersion: Prisma.CVVersionGetPayload<{
      include: {
        sourceFile: true;
        cv: {
          include: {
            candidateProfile: {
              include: {
                account: { select: { fullName: true; email: true } };
                skills: { include: { skill: true } };
                experiences: true;
                projects: true;
                educations: true;
                certifications: true;
                jobPreference: true;
              };
            };
          };
        };
      };
    }>,
  ) {
    const parsedText = cvVersion.parsedText?.trim();
    if (parsedText) {
      return parsedText;
    }

    const profile = cvVersion.cv.candidateProfile;
    const skills = profile.skills
      .map((item) =>
        [
          item.skill.name,
          item.proficiencyLevel,
          item.yearsOfExperience ? `${item.yearsOfExperience.toString()} years` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join(', ');
    const experiences = profile.experiences
      .map((item) =>
        [item.positionTitle, item.companyName, item.technologies, item.description]
          .filter(Boolean)
          .join(' - '),
      )
      .join('\n');
    const projects = profile.projects
      .map((item) =>
        [item.name, item.role, item.technologies, item.description].filter(Boolean).join(' - '),
      )
      .join('\n');
    const educations = profile.educations
      .map((item) =>
        [item.schoolName, item.degree, item.major, item.description].filter(Boolean).join(' - '),
      )
      .join('\n');
    const certifications = profile.certifications
      .map((item) => [item.name, item.organization].filter(Boolean).join(' - '))
      .join(', ');

    return this.compactLines([
      `CV file: ${cvVersion.sourceFile?.originalName ?? cvVersion.cv.title}`,
      `Candidate name: ${profile.account.fullName}`,
      `Candidate email: ${profile.account.email}`,
      `Headline: ${profile.jobPreference?.desiredPosition ?? ''}`,
      `Profile summary: ${profile.description ?? ''}`,
      `Skills: ${skills}`,
      `Experience: ${experiences}`,
      `Projects: ${projects}`,
      `Education: ${educations}`,
      `Certifications: ${certifications}`,
    ]);
  }

  private normalizeVector(value: number[]) {
    const vector = this.assertVector(value);
    const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));

    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error('Gemini returned a zero or invalid embedding vector');
    }

    // gemini-embedding-001 only normalizes its default 3072-dimensional
    // output. Reduced dimensions must be normalized by the caller.
    return vector.map((item) => item / norm);
  }

  private assertVector(value: unknown): number[] {
    if (!this.isNumberArray(value) || value.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding vector must contain ${EMBEDDING_DIMENSIONS} finite numbers`);
    }

    return value;
  }

  private async updateSearchVector(
    table: 'job_embeddings' | 'cv_embeddings',
    id: string,
    vector: number[],
  ) {
    const serialized = pgvector.toSql(this.assertVector(vector));
    if (!serialized) {
      throw new Error('Unable to serialize embedding for pgvector storage');
    }

    if (table === 'job_embeddings') {
      await this.prisma.$executeRaw`
        UPDATE "job_embeddings"
        SET "search_vector" = ${serialized}::vector(768)
        WHERE "id" = ${id}::uuid
      `;
      return;
    }

    await this.prisma.$executeRaw`
      UPDATE "cv_embeddings"
      SET "search_vector" = ${serialized}::vector(768)
      WHERE "id" = ${id}::uuid
    `;
  }

  private async getReadySearchVectorIds(
    table: 'job_embeddings' | 'cv_embeddings',
    ids: string[],
  ) {
    if (ids.length === 0) {
      return new Set<string>();
    }

    const query =
      table === 'job_embeddings'
        ? Prisma.sql`
            SELECT "id"
            FROM "job_embeddings"
            WHERE "id" IN (${Prisma.join(ids)})
              AND "search_vector" IS NOT NULL
          `
        : Prisma.sql`
            SELECT "id"
            FROM "cv_embeddings"
            WHERE "id" IN (${Prisma.join(ids)})
              AND "search_vector" IS NOT NULL
          `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(query);
    return new Set(rows.map((row) => row.id));
  }

  private normalizeForEmbedding(text: string) {
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EMBEDDING_TEXT_LENGTH);
  }

  private compactLines(lines: string[]) {
    return lines
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line) => line && !line.endsWith(':'))
      .join('\n');
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

  private roundScore(value: number) {
    return Math.round(value * 100) / 100;
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

  private async withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await this.delay(500 * attempt);
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorStack(error: unknown) {
    return error instanceof Error ? error.stack : undefined;
  }
}
