import { Logger } from '@nestjs/common';
import {
  CompanyLicenseExtractionProviderPort,
  CompanyLicenseExtractionRequest,
  CompanyLicenseExtractionResponse,
} from '../ports/company-license-extraction-provider.port';

/**
 * Fallback is deliberately limited to transport/capacity failures. A malformed
 * structured result must surface rather than be silently replaced by another
 * model: onboarding uses these fields to verify a company, so a second opinion
 * that quietly disagrees is worse than an error the recruiter can retry.
 */
export class FallbackCompanyLicenseExtractionAdapter implements CompanyLicenseExtractionProviderPort {
  private readonly logger = new Logger(FallbackCompanyLicenseExtractionAdapter.name);
  readonly modelName: string;

  constructor(
    private readonly primary: CompanyLicenseExtractionProviderPort,
    private readonly fallback: CompanyLicenseExtractionProviderPort,
  ) {
    this.modelName = `${primary.modelName} (fallback: ${fallback.modelName})`;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async extractStructured(
    request: CompanyLicenseExtractionRequest,
  ): Promise<CompanyLicenseExtractionResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.extractStructured(request);
    } catch (error) {
      if (!this.canFallback(error) || !this.fallback.isConfigured()) throw error;
      const code = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`upnext-ai licence extraction unavailable; using direct Gemini (${code})`);
      return this.fallback.extractStructured(request);
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
