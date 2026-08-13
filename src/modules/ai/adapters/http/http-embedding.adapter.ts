import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  EMBEDDING_CACHE_KEY,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_NORMALIZATION,
  EmbeddingProviderPort,
  EmbeddingProviderResponse,
} from '../../ports/embedding-provider.port';

@Injectable()
export class HttpEmbeddingAdapter implements EmbeddingProviderPort {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.secret());
  }

  async createEmbedding(
    text: string,
    externalSignal?: AbortSignal,
  ): Promise<EmbeddingProviderResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      this.configService.get<number>('aiEmbeddingServiceTimeoutMs') ?? 20_000,
    );
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const baseUrl = this.baseUrl();
      const secret = this.secret();
      if (!baseUrl || !secret) throw new Error('AI_SERVICE_UNAVAILABLE');
      const token = await this.jwtService.signAsync(
        {
          scope: 'embedding:invoke',
          environment: this.configService.get<string>('appEnv'),
          jti: randomUUID(),
        },
        {
          secret,
          issuer: 'upnext-be',
          audience: 'upnext-ai',
          subject: 'upnext-be',
          expiresIn: '60s',
        },
      );
      const response = await fetch(new URL('/internal/v1/embeddings', `${baseUrl}/`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dimensions: EMBEDDING_DIMENSIONS }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error('AI_MODEL_RATE_LIMIT');
        if (response.status === 504) throw new Error('AI_MODEL_TIMEOUT');
        if (response.status === 400 || response.status === 422)
          throw new Error('AI_INVALID_OUTPUT');
        throw new Error('AI_SERVICE_UNAVAILABLE');
      }
      const body = (await response.json()) as Record<string, unknown>;
      if (
        body.model !== EMBEDDING_MODEL ||
        body.dimensions !== EMBEDDING_DIMENSIONS ||
        body.normalization !== EMBEDDING_NORMALIZATION ||
        body.cacheKey !== EMBEDDING_CACHE_KEY ||
        !Array.isArray(body.vector) ||
        body.vector.length !== EMBEDDING_DIMENSIONS ||
        body.vector.some((item) => typeof item !== 'number' || !Number.isFinite(item))
      )
        throw new Error('AI_INVALID_OUTPUT');
      return {
        vector: body.vector as number[],
        modelName: EMBEDDING_MODEL,
        cacheKey: EMBEDDING_CACHE_KEY,
      };
    } catch (error) {
      if (timedOut) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  private baseUrl() {
    return this.configService.get<string>('aiServiceUrl')?.trim().replace(/\/+$/, '') || null;
  }
  private secret() {
    return this.configService.get<string>('aiInternalJwtSecret')?.trim() || null;
  }
}
