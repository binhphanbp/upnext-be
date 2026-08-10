import { Logger } from '@nestjs/common';
import {
  LlmProviderPort,
  LlmStreamChunk,
  StructuredRequest,
  StructuredResponse,
  TextStreamRequest,
} from '../../ports/llm-provider.port';

/**
 * Fail closed after output has started: retrying with Gemini at that point would
 * duplicate an answer in the chat. Fallback is only used before the first byte
 * of a stream or before a structured result exists.
 */
export class FallbackLlmAdapter implements LlmProviderPort {
  private readonly logger = new Logger(FallbackLlmAdapter.name);
  readonly modelName: string;

  constructor(
    private readonly primary: LlmProviderPort,
    private readonly fallback: LlmProviderPort,
  ) {
    this.modelName = `${primary.modelName} (fallback: ${fallback.modelName})`;
  }

  isConfigured(): boolean {
    return this.primary.isConfigured() || this.fallback.isConfigured();
  }

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      return await this.primary.generateStructured(request);
    } catch (error) {
      if (!this.canFallback(error)) throw error;
      this.logFallback(error);
      if (!this.fallback.isConfigured()) throw error;
      return this.fallback.generateStructured(request);
    }
  }

  async *streamText(request: TextStreamRequest): AsyncGenerator<LlmStreamChunk> {
    let started = false;
    try {
      if (!this.primary.isConfigured()) throw new Error('AI_SERVICE_UNAVAILABLE');
      for await (const chunk of this.primary.streamText(request)) {
        started = true;
        yield chunk;
      }
      return;
    } catch (error) {
      if (started || !this.canFallback(error) || !this.fallback.isConfigured()) throw error;
      this.logFallback(error);
      yield* this.fallback.streamText(request);
    }
  }

  private canFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return ['AI_SERVICE_UNAVAILABLE', 'AI_MODEL_TIMEOUT', 'AI_MODEL_RATE_LIMIT'].includes(
      error.message,
    );
  }

  private logFallback(error: unknown): void {
    const code = error instanceof Error ? error.message : 'unknown';
    this.logger.warn(
      `upnext-ai unavailable before output; using direct provider fallback (${code})`,
    );
  }
}
