import { Logger } from '@nestjs/common';
import {
  JobPostGenerationProviderPort,
  JobPostGenerationRequest,
  JobPostGenerationResponse,
} from '../ports/job-post-generation-provider.port';

/**
 * Fallback is deliberately limited to transport/capacity failures. A malformed
 * structured result must surface rather than be silently replaced by another model.
 */
export class FallbackJobPostGenerationAdapter implements JobPostGenerationProviderPort {
  private readonly logger = new Logger(FallbackJobPostGenerationAdapter.name);
  readonly modelName: string;

  constructor(
    private readonly primary: JobPostGenerationProviderPort,
    private readonly fallback: JobPostGenerationProviderPort,
  ) {
    this.modelName = `${primary.modelName} (fallback: ${fallback.modelName})`;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async generateStructured(request: JobPostGenerationRequest): Promise<JobPostGenerationResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.generateStructured(request);
    } catch (error) {
      if (!this.canFallback(error) || !this.fallback.isConfigured()) throw error;
      const code = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`upnext-ai JD generation unavailable; using direct Gemini (${code})`);
      return this.fallback.generateStructured(request);
    }
  }

  private canFallback(error: unknown): boolean {
    return (
      error instanceof Error &&
      ['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'].includes(error.message)
    );
  }
}
