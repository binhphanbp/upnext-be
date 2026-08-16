/**
 * Narrow capability boundary for reading a company's business licence during
 * onboarding. The caller has already authenticated the recruiter and validated
 * the upload; this port only turns a document into registration fields.
 */
export const COMPANY_LICENSE_EXTRACTION_PROVIDER = Symbol('COMPANY_LICENSE_EXTRACTION_PROVIDER');

export type CompanyLicenseFile = {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
};

export type CompanyLicenseExtractionRequest = {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  /** Required: there is no licence extraction without the document. */
  file: CompanyLicenseFile;
  temperature?: number;
  signal?: AbortSignal;
};

export type CompanyLicenseExtractionResponse = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
};

export interface CompanyLicenseExtractionProviderPort {
  readonly modelName: string;
  isConfigured(): boolean;
  extractStructured(
    request: CompanyLicenseExtractionRequest,
  ): Promise<CompanyLicenseExtractionResponse>;
}
