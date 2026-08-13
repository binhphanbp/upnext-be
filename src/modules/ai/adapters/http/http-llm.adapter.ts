import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  LlmProviderPort,
  LlmStreamChunk,
  StructuredRequest,
  StructuredResponse,
  TextStreamRequest,
} from '../../ports/llm-provider.port';

type ServiceStructuredResponse = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

type SseFrame = { event: string; data: string };

type ServiceResponse = {
  response: Response;
  release: () => void;
  timedOut: () => boolean;
};

/**
 * Authenticated internal client for upnext-ai.
 *
 * This adapter only transports a request already authorised and context-minimised
 * by the Nest orchestrator. It never accepts browser traffic, user JWTs, or
 * writes business data. The service token has a narrow audience/scope and a
 * 60-second TTL to keep a compromised internal request non-reusable long-term.
 */
@Injectable()
export class HttpLlmAdapter implements LlmProviderPort {
  private readonly logger = new Logger(HttpLlmAdapter.name);
  readonly modelName = 'upnext-ai/gemini';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.internalSecret());
  }

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    const { response, release } = await this.openRequest(
      '/internal/v1/llm/structured',
      {
        systemInstruction: request.systemInstruction,
        messages: request.messages,
        responseSchema: request.responseSchema,
        temperature: request.temperature,
        modelTier: request.modelTier,
        executionProfile: request.executionProfile,
      },
      request.signal,
      request.executionProfile === 'batch'
        ? (this.configService.get<number>('aiBatchServiceTimeoutMs') ?? 90_000)
        : undefined,
    );

    try {
      const body = (await response.json()) as ServiceStructuredResponse;
      if (
        !body ||
        !Number.isFinite(body.inputTokens) ||
        !Number.isFinite(body.outputTokens) ||
        typeof body.model !== 'string'
      ) {
        throw new Error('AI_INVALID_OUTPUT');
      }
      return {
        value: body.value,
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        modelName: body.model,
      };
    } finally {
      release();
    }
  }

  async *streamText(request: TextStreamRequest): AsyncGenerator<LlmStreamChunk> {
    const connection = await this.openRequest(
      '/internal/v1/llm/stream',
      {
        systemInstruction: request.systemInstruction,
        messages: request.messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      },
      request.signal,
    );
    if (!connection.response.body) {
      connection.release();
      throw new Error('AI_SERVICE_UNAVAILABLE');
    }

    try {
      for await (const frame of this.readSse(connection.response.body)) {
        if (frame.event === 'text') {
          const payload = this.parseFrame(frame);
          if (typeof payload.text === 'string' && payload.text) {
            yield { kind: 'text', text: payload.text };
          }
        } else if (frame.event === 'usage') {
          const payload = this.parseFrame(frame);
          if (Number.isFinite(payload.inputTokens) && Number.isFinite(payload.outputTokens)) {
            yield {
              kind: 'usage',
              inputTokens: Number(payload.inputTokens),
              outputTokens: Number(payload.outputTokens),
            };
          }
        } else if (frame.event === 'error') {
          const payload = this.parseFrame(frame);
          throw new Error(this.knownErrorCode(payload.code));
        }
      }
    } catch (error) {
      if (connection.timedOut()) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    } finally {
      connection.release();
    }
  }

  private async openRequest(
    path: string,
    body: object,
    externalSignal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<ServiceResponse> {
    const endpoint = this.endpoint(path);
    const { signal, release, timedOut } = this.linkedSignal(externalSignal, timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.serviceToken()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        this.logger.warn(`upnext-ai returned ${response.status}; body omitted from logs`, {
          responseBytes: responseBody.length,
        });
        throw new Error(this.serviceError(response.status, responseBody));
      }
      return { response, release, timedOut };
    } catch (error) {
      release();
      if (timedOut()) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    }
  }

  private baseUrl(): string | null {
    return this.configService.get<string>('aiServiceUrl')?.trim().replace(/\/+$/, '') || null;
  }

  private internalSecret(): string | null {
    return this.configService.get<string>('aiInternalJwtSecret')?.trim() || null;
  }

  private endpoint(path: string): string {
    const baseUrl = this.baseUrl();
    if (!baseUrl || !this.internalSecret()) throw new Error('AI_SERVICE_UNAVAILABLE');
    return new URL(path, `${baseUrl}/`).toString();
  }

  private async serviceToken(): Promise<string> {
    const secret = this.internalSecret();
    if (!secret) throw new Error('AI_SERVICE_UNAVAILABLE');
    return this.jwtService.signAsync(
      {
        scope: 'llm:invoke',
        environment: this.configService.get<string>('appEnv'),
        jti: randomUUID(),
      },
      {
        secret,
        issuer: 'upnext-be',
        audience: 'upnext-ai',
        subject: 'upnext-be',
        expiresIn: '60s',
      },
    );
  }

  private linkedSignal(
    external?: AbortSignal,
    timeoutMs?: number,
  ): {
    signal: AbortSignal;
    release: () => void;
    timedOut: () => boolean;
  } {
    const controller = new AbortController();
    let didTimeout = false;
    let released = false;
    const timer = setTimeout(
      () => {
        didTimeout = true;
        controller.abort(new Error('timeout'));
      },
      timeoutMs ?? this.configService.get<number>('aiServiceTimeoutMs') ?? 25_000,
    );
    const forwardAbort = () => controller.abort(external?.reason);
    if (external?.aborted) forwardAbort();
    else external?.addEventListener('abort', forwardAbort, { once: true });
    return {
      signal: controller.signal,
      timedOut: () => didTimeout,
      release: () => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        external?.removeEventListener('abort', forwardAbort);
      },
    };
  }

  private async *readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = this.decodeFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (frame) yield frame;
          boundary = buffer.indexOf('\n\n');
        }
      }
      const frame = this.decodeFrame(buffer);
      if (frame) yield frame;
    } finally {
      reader.releaseLock();
    }
  }

  private decodeFrame(raw: string): SseFrame | null {
    let event = 'message';
    const data: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    return data.length ? { event, data: data.join('\n') } : null;
  }

  private parseFrame(frame: SseFrame): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(frame.data);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      throw new Error('AI_INVALID_OUTPUT');
    }
  }

  private serviceError(status: number, responseBody: string): string {
    const providerCode = this.parseServiceErrorCode(responseBody);
    if (providerCode) return providerCode;
    if (status === 429) return 'AI_MODEL_RATE_LIMIT';
    if (status === 400 || status === 422) return 'AI_INVALID_OUTPUT';
    if (status === 504) return 'AI_MODEL_TIMEOUT';
    return 'AI_SERVICE_UNAVAILABLE';
  }

  private parseServiceErrorCode(responseBody: string): string | null {
    try {
      const parsed = JSON.parse(responseBody) as {
        detail?: { code?: unknown } | string;
      };
      const value =
        parsed.detail && typeof parsed.detail === 'object' ? parsed.detail.code : undefined;
      return typeof value === 'string' ? this.knownErrorCode(value) : null;
    } catch {
      return null;
    }
  }

  private knownErrorCode(value: unknown): string {
    const allowed = new Set([
      'AI_MODEL_TIMEOUT',
      'AI_MODEL_RATE_LIMIT',
      'AI_INVALID_OUTPUT',
      'AI_CONTENT_BLOCKED',
      'AI_SERVICE_UNAVAILABLE',
    ]);
    return typeof value === 'string' && allowed.has(value) ? value : 'AI_SERVICE_UNAVAILABLE';
  }
}
