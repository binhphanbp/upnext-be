import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompanyLicenseExtractionProviderPort,
  CompanyLicenseExtractionRequest,
  CompanyLicenseExtractionResponse,
} from '../ports/company-license-extraction-provider.port';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const LICENSE_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Direct Gemini path for licence extraction, kept as the fallback while the
 * capability moves to upnext-ai. Behaviour is unchanged from the inline
 * implementation this replaces, so a rollback flips one env var and nothing
 * about the resulting fields moves.
 */
@Injectable()
export class GeminiCompanyLicenseExtractionAdapter implements CompanyLicenseExtractionProviderPort {
  private readonly logger = new Logger(GeminiCompanyLicenseExtractionAdapter.name);
  readonly modelName = LICENSE_MODEL;

  constructor(private readonly configService: ConfigService) { }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async extractStructured(
    request: CompanyLicenseExtractionRequest,
  ): Promise<CompanyLicenseExtractionResponse> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('AI_SERVICE_UNAVAILABLE');

    const { signal, release, timedOut } = this.linkedSignal(request.signal);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${LICENSE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: request.file.mimeType,
                      data: request.file.base64Data,
                    },
                  },
                  { text: `${request.systemInstruction}\n\n${request.prompt}` },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: request.responseSchema,
              ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            },
          }),
        },
      );

      if (!response.ok) {
        // The body can echo document content, so only its size is logged.
        const body = await response.text().catch(() => '');
        this.logger.warn(`Gemini licence extraction returned ${response.status}; body omitted`, {
          responseBytes: body.length,
        });
        if (response.status === 429) throw new Error('AI_MODEL_RATE_LIMIT');
        throw new Error('AI_SERVICE_UNAVAILABLE');
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('AI_INVALID_OUTPUT');

      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error('AI_INVALID_OUTPUT');
      }

      return {
        value,
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        modelName: LICENSE_MODEL,
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
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort(new Error('timeout'));
    }, REQUEST_TIMEOUT_MS);
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
}
