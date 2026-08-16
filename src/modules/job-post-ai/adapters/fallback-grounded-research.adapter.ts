import { Logger } from '@nestjs/common';
import {
  GroundedResearchProviderPort,
  GroundedResearchRequest,
  GroundedResearchResponse,
} from '../ports/grounded-research-provider.port';

/**
 * Fallback is deliberately limited to transport/capacity failures. An answer the
 * service rejected as malformed must surface rather than be quietly replaced by a
 * second run: a grounded call is expensive, and retrying it through another path
 * doubles the cost for an answer the caller is going to validate anyway.
 */
export class FallbackGroundedResearchAdapter implements GroundedResearchProviderPort {
  private readonly logger = new Logger(FallbackGroundedResearchAdapter.name);
  readonly modelName: string;

  constructor(
    private readonly primary: GroundedResearchProviderPort,
    private readonly fallback: GroundedResearchProviderPort,
  ) {
    this.modelName = `${primary.modelName} (fallback: ${fallback.modelName})`;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async generateGrounded(request: GroundedResearchRequest): Promise<GroundedResearchResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.generateGrounded(request);
    } catch (error) {
      if (!this.canFallback(error) || !this.fallback.isConfigured()) throw error;
      const code = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`upnext-ai grounded research unavailable; using direct Gemini (${code})`);
      return this.fallback.generateGrounded(request);
    }
  }

  private canFallback(error: unknown): boolean {
    return (
      error instanceof Error &&
      [
        'AI_SERVICE_UNAVAILABLE',
        'AI_MODEL_TIMEOUT',
        'AI_MODEL_RATE_LIMIT',
        // A region block is an infrastructure refusal, not a bad request:
        // the direct path may still be reachable from a different egress.
        'AI_PROVIDER_REGION_BLOCKED',
      ].includes(error.message)
    );
  }
}
