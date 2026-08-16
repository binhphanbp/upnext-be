/**
 * Narrow capability boundary for an answer that must be backed by live web
 * sources rather than the model's own memory.
 *
 * The port returns the answer text unparsed together with the evidence the
 * model consulted. It deliberately does not know what shape the caller asked
 * for: a response schema cannot be combined with the provider's search tool
 * without emptying the grounding metadata, so the shape is pinned in the
 * prompt and parsed by the caller. Deciding whether the evidence is strong
 * enough to act on is likewise the caller's rule, not this port's.
 */
export const GROUNDED_RESEARCH_PROVIDER = Symbol('GROUNDED_RESEARCH_PROVIDER');

export type GroundedSource = {
  title: string;
  url: string;
};

export type GroundedResearchRequest = {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  signal?: AbortSignal;
};

export type GroundedResearchResponse = {
  text: string;
  sources: GroundedSource[];
  searchQueries: string[];
  inputTokens: number;
  outputTokens: number;
  modelName: string;
};

export interface GroundedResearchProviderPort {
  readonly modelName: string;
  isConfigured(): boolean;
  generateGrounded(request: GroundedResearchRequest): Promise<GroundedResearchResponse>;
}
