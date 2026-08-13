/**
 * Narrow capability boundary for generating a structured JD from recruiter
 * form data. Unlike JD import, this accepts no source file or browser context.
 */
export const JOB_POST_GENERATION_PROVIDER = Symbol('JOB_POST_GENERATION_PROVIDER');

export type JobPostGenerationRequest = {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
};

export type JobPostGenerationResponse = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
};

export interface JobPostGenerationProviderPort {
  readonly modelName: string;
  isConfigured(): boolean;
  generateStructured(request: JobPostGenerationRequest): Promise<JobPostGenerationResponse>;
}
