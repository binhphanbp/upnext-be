/**
 * Narrow capability boundary for extracting a structured job-post draft from a
 * recruiter-provided JD. The caller has already authenticated the recruiter,
 * enforced subscription/quota, and prepared a safe source payload.
 */
export const JOB_POST_EXTRACTION_PROVIDER = Symbol('JOB_POST_EXTRACTION_PROVIDER');

export type JobPostExtractionFile = {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
};

export type JobPostExtractionRequest = {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  file?: JobPostExtractionFile;
  temperature?: number;
  signal?: AbortSignal;
};

export type JobPostExtractionResponse = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
};

export interface JobPostExtractionProviderPort {
  readonly modelName: string;
  isConfigured(): boolean;
  extractStructured(request: JobPostExtractionRequest): Promise<JobPostExtractionResponse>;
}
