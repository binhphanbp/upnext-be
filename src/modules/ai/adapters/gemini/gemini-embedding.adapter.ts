import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingProviderPort,
  EmbeddingProviderResponse,
} from '../../ports/embedding-provider.port';

@Injectable()
export class GeminiEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('geminiApiKey')?.trim());
  }

  async createEmbedding(text: string, signal?: AbortSignal): Promise<EmbeddingProviderResponse> {
    const apiKey = this.configService.get<string>('geminiApiKey')?.trim();
    if (!apiKey) throw new Error('AI_SERVICE_UNAVAILABLE');

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: `models/${EMBEDDING_MODEL}`,
              content: { parts: [{ text }] },
              outputDimensionality: EMBEDDING_DIMENSIONS,
            }),
            signal,
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 429 ? 'AI_MODEL_RATE_LIMIT' : 'AI_SERVICE_UNAVAILABLE',
          );
        const data = (await response.json()) as { embedding?: { values?: unknown } };
        const vector = this.normalize(data.embedding?.values);
        return { vector, modelName: EMBEDDING_MODEL, cacheKey: EMBEDDING_CACHE_KEY };
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.message === 'AI_INVALID_OUTPUT') throw error;
        if (signal?.aborted || attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError;
  }

  private normalize(value: unknown): number[] {
    if (
      !Array.isArray(value) ||
      value.length !== EMBEDDING_DIMENSIONS ||
      value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
    ) {
      throw new Error('AI_INVALID_OUTPUT');
    }
    const vector = value as number[];
    const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
    if (!Number.isFinite(norm) || norm === 0) throw new Error('AI_INVALID_OUTPUT');
    return vector.map((item) => item / norm);
  }
}
