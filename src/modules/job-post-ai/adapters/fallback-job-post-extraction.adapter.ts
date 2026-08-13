import { Logger } from '@nestjs/common';
import {
  JobPostExtractionProviderPort,
  JobPostExtractionRequest,
  JobPostExtractionResponse,
} from '../ports/job-post-extraction-provider.port';

/**
 * Fallback is deliberately limited to transport/capacity failures. A malformed
 * structured result must surface rather than be silently replaced by another model.
 */
export class FallbackJobPostExtractionAdapter implements JobPostExtractionProviderPort {
  private readonly logger = new Logger(FallbackJobPostExtractionAdapter.name);
  readonly modelName: string;

  constructor(
    private readonly primary: JobPostExtractionProviderPort,
    private readonly fallback: JobPostExtractionProviderPort,
  ) {
    this.modelName = `${primary.modelName} (fallback: ${fallback.modelName})`;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async extractStructured(request: JobPostExtractionRequest): Promise<JobPostExtractionResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.extractStructured(request);
    } catch (error) {
      if (!this.canFallback(error) || !this.fallback.isConfigured()) throw error;
      const code = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`upnext-ai JD extraction unavailable; using direct Gemini (${code})`);
      return this.fallback.extractStructured(request);
    }
  }

  private canFallback(error: unknown): boolean {
    return (
      error instanceof Error &&
      ['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'].includes(error.message)
    );
  }
}
