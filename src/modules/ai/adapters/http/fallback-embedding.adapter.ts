import { Logger } from '@nestjs/common';
import {
  EmbeddingProviderPort,
  EmbeddingProviderResponse,
} from '../../ports/embedding-provider.port';

export class FallbackEmbeddingAdapter implements EmbeddingProviderPort {
  private readonly logger = new Logger(FallbackEmbeddingAdapter.name);
  constructor(
    private readonly primary: EmbeddingProviderPort,
    private readonly fallback: EmbeddingProviderPort,
  ) {}
  isConfigured() {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }
  async createEmbedding(text: string, signal?: AbortSignal): Promise<EmbeddingProviderResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.createEmbedding(text, signal);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'].includes(
          error.message,
        ) ||
        !this.fallback.isConfigured()
      )
        throw error;
      this.logger.warn(
        `upnext-ai embedding unavailable; using direct provider fallback (${error.message})`,
      );
      return this.fallback.createEmbedding(text, signal);
    }
  }
}
