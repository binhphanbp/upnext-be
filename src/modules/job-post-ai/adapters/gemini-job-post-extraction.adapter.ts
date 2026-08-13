import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JobPostExtractionProviderPort,
  JobPostExtractionRequest,
  JobPostExtractionResponse,
} from '../ports/job-post-extraction-provider.port';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const JOB_POST_MODEL = 'gemini-2.5-flash';

/** Direct provider retained as the explicit default and rollback target. */
@Injectable()
export class GeminiJobPostExtractionAdapter implements JobPostExtractionProviderPort {
  readonly modelName = JOB_POST_MODEL;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async extractStructured(request: JobPostExtractionRequest): Promise<JobPostExtractionResponse> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('AI_SERVICE_UNAVAILABLE');

    const { signal, release, timedOut } = this.linkedSignal(request.signal);
    try {
      const parts: Array<Record<string, unknown>> = [];
      if (request.file) {
        parts.push({
          inlineData: {
            mimeType: request.file.mimeType,
            data: request.file.base64Data,
          },
        });
      }
      parts.push({ text: request.prompt });

      const response = await fetch(
        `${GEMINI_API_BASE}/models/${JOB_POST_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: request.temperature ?? 0.3,
              topP: 0.9,
              candidateCount: 1,
              responseMimeType: 'application/json',
              responseSchema: request.responseSchema,
            },
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(this.serviceError(response.status, body));
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) throw new Error('AI_INVALID_OUTPUT');

      return {
        value: parseJson(text),
        inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
        modelName: JOB_POST_MODEL,
      };
    } catch (error) {
      if (timedOut()) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    } finally {
      release();
    }
  }

  private apiKey(): string | null {
    return this.configService.get<string>('geminiApiKey')?.trim() || null;
  }

  private linkedSignal(external?: AbortSignal) {
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutMs = this.configService.get<number>('aiJobPostExtractionTimeoutMs') ?? 45_000;
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
    if (status === 400 || status === 422) return 'AI_INVALID_OUTPUT';
    void body;
    return 'AI_SERVICE_UNAVAILABLE';
  }
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const cleaned = text
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as unknown;
      } catch {
        throw new Error('AI_INVALID_OUTPUT');
      }
    }
    throw new Error('AI_INVALID_OUTPUT');
  }
}
