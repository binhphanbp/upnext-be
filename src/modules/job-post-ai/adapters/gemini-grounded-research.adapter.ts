import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GroundedResearchProviderPort,
  GroundedResearchRequest,
  GroundedResearchResponse,
  GroundedSource,
} from '../ports/grounded-research-provider.port';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Measured on this workload: the Gemini 3.x models answer the prompt without ever calling the
// search tool, so groundingMetadata comes back empty and the result is discarded for lack of
// citations. 2.5-pro searches every time and is also faster here.
const GROUNDED_MODEL = 'gemini-2.5-pro';
// A grounded search runs several Google queries before it answers; measured round trips sit at
// 42–50s. A tighter budget aborts every call and the recruiter only ever sees "not enough data".
const DEFAULT_TIMEOUT_MS = 75_000;
const MAX_SOURCES = 8;

/** Direct provider retained as the explicit default and rollback target. */
@Injectable()
export class GeminiGroundedResearchAdapter implements GroundedResearchProviderPort {
  readonly modelName = GROUNDED_MODEL;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async generateGrounded(request: GroundedResearchRequest): Promise<GroundedResearchResponse> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('AI_SERVICE_UNAVAILABLE');

    const { signal, release, timedOut } = this.linkedSignal(request.signal);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${GROUNDED_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
            tools: [{ googleSearch: {} }],
            // No structured-output config on purpose: asking for a response schema alongside
            // googleSearch makes the API return an empty groundingMetadata, and citations are the
            // whole point of this call. The shape is pinned in the prompt and parsed by the caller.
            generationConfig: {
              temperature: request.temperature ?? 0.1,
              candidateCount: 1,
            },
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(this.serviceError(response.status, body));
      }

      const data = (await response.json()) as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) throw new Error('AI_INVALID_OUTPUT');

      return {
        text,
        sources: this.extractSources(candidate?.groundingMetadata),
        searchQueries: (candidate?.groundingMetadata?.webSearchQueries ?? [])
          .map((query) => query.trim())
          .filter(Boolean),
        inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
        modelName: GROUNDED_MODEL,
      };
    } catch (error) {
      if (timedOut()) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    } finally {
      release();
    }
  }

  private extractSources(groundingMetadata?: GroundingMetadata): GroundedSource[] {
    const sources = new Map<string, GroundedSource>();
    for (const chunk of groundingMetadata?.groundingChunks ?? []) {
      const title = chunk.web?.title?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '';
      const url = chunk.web?.uri?.trim() ?? '';
      if (!title || !isHttpUrl(url) || sources.has(url)) continue;
      sources.set(url, { title, url });
      if (sources.size >= MAX_SOURCES) break;
    }
    return Array.from(sources.values());
  }

  private apiKey(): string | null {
    return this.configService.get<string>('geminiApiKey')?.trim() || null;
  }

  private linkedSignal(external?: AbortSignal) {
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutMs =
      this.configService.get<number>('aiGroundedResearchTimeoutMs') ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort(new Error('timeout'));
    }, timeoutMs);
    const forwardAbort = () => controller.abort(external?.reason);
    if (external?.aborted) forwardAbort();
    else external?.addEventListener('abort', forwardAbort, { once: true });
    return {
      signal: controller.signal,
      timedOut: () => didTimeout,
      release: () => {
        clearTimeout(timer);
        external?.removeEventListener('abort', forwardAbort);
      },
    };
  }

  private serviceError(status: number, body: string): string {
    if (status === 429) return 'AI_MODEL_RATE_LIMIT';
    if (status === 408 || status === 504) return 'AI_MODEL_TIMEOUT';
    // Gemini reports some infrastructure restrictions (for example, a region where the API cannot
    // be used) as HTTP 400. No answer was produced in that case, so preserve it as an availability
    // failure instead of incorrectly blaming the prompt.
    if (status === 400 && this.isFailedPrecondition(body)) return 'AI_SERVICE_UNAVAILABLE';
    if (status === 400 || status === 422) return 'AI_INVALID_OUTPUT';
    return 'AI_SERVICE_UNAVAILABLE';
  }

  private isFailedPrecondition(body: string): boolean {
    try {
      const parsed = JSON.parse(body) as { error?: { status?: unknown } };
      return parsed.error?.status === 'FAILED_PRECONDITION';
    } catch {
      return false;
    }
  }
}

type GroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: GroundingMetadata;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
