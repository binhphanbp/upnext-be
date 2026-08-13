export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_NORMALIZATION = 'l2-v1';
export const EMBEDDING_CACHE_KEY = `${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${EMBEDDING_NORMALIZATION}`;
export const MAX_EMBEDDING_TEXT_LENGTH = 12_000;

export type EmbeddingProviderResponse = {
  vector: number[];
  modelName: string;
  cacheKey: string;
};

export interface EmbeddingProviderPort {
  isConfigured(): boolean;
  createEmbedding(text: string, signal?: AbortSignal): Promise<EmbeddingProviderResponse>;
}
