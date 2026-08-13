import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  JobPostExtractionProviderPort,
  JobPostExtractionRequest,
  JobPostExtractionResponse,
} from '../ports/job-post-extraction-provider.port';

type ServiceResponse = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

/** Private client for the one JD-extraction capability; never accepts browser JWTs. */
@Injectable()
export class HttpJobPostExtractionAdapter implements JobPostExtractionProviderPort {
  private readonly logger = new Logger(HttpJobPostExtractionAdapter.name);
  readonly modelName = 'upnext-ai/gemini';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.internalSecret());
  }

  async extractStructured(request: JobPostExtractionRequest): Promise<JobPostExtractionResponse> {
    const endpoint = this.endpoint();
    const { signal, release, timedOut } = this.linkedSignal(request.signal);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.serviceToken()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: request.systemInstruction,
          prompt: request.prompt,
          responseSchema: request.responseSchema,
          file: request.file,
          temperature: request.temperature,
          modelTier: 'quality',
          executionProfile: 'interactive',
        }),
        signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`upnext-ai JD extraction returned ${response.status}; body omitted`, {
          responseBytes: body.length,
        });
        throw new Error(this.serviceError(response.status, body));
      }
      const body = (await response.json()) as ServiceResponse;
      if (
        !body ||
        !Object.prototype.hasOwnProperty.call(body, 'value') ||
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
    } catch (error) {
      if (timedOut()) throw new Error('AI_MODEL_TIMEOUT', { cause: error });
      if (error instanceof Error && error.message.startsWith('AI_')) throw error;
      throw new Error('AI_SERVICE_UNAVAILABLE', { cause: error });
    } finally {
      release();
    }
  }

  private baseUrl(): string | null {
    return this.configService.get<string>('aiServiceUrl')?.trim().replace(/\/+$/, '') || null;
  }

  private internalSecret(): string | null {
    return this.configService.get<string>('aiInternalJwtSecret')?.trim() || null;
  }

  private endpoint(): string {
    const baseUrl = this.baseUrl();
    if (!baseUrl || !this.internalSecret()) throw new Error('AI_SERVICE_UNAVAILABLE');
    return new URL('/internal/v1/job-posts/extract', `${baseUrl}/`).toString();
  }

  private serviceToken(): Promise<string> {
    const secret = this.internalSecret();
    if (!secret) return Promise.reject(new Error('AI_SERVICE_UNAVAILABLE'));
    return this.jwtService.signAsync(
      {
        scope: 'job-post:extract',
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

  private linkedSignal(external?: AbortSignal) {
    const controller = new AbortController();
    let didTimeout = false;
    const timer = setTimeout(
      () => {
        didTimeout = true;
        controller.abort(new Error('timeout'));
      },
      this.configService.get<number>('aiJobPostExtractionTimeoutMs') ?? 45_000,
    );
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

  private serviceError(status: number, responseBody: string): string {
    const code = this.parseCode(responseBody);
    if (code) return code;
    if (status === 429) return 'AI_MODEL_RATE_LIMIT';
    if (status === 504) return 'AI_MODEL_TIMEOUT';
    if (status === 400 || status === 422) return 'AI_INVALID_OUTPUT';
    return 'AI_SERVICE_UNAVAILABLE';
  }

  private parseCode(responseBody: string): string | null {
    try {
      const parsed = JSON.parse(responseBody) as { detail?: { code?: unknown } };
      const code = parsed.detail?.code;
      return this.isKnownCode(code) ? code : null;
    } catch {
      return null;
    }
  }

  private isKnownCode(code: unknown): code is string {
    return (
      typeof code === 'string' &&
      [
        'AI_MODEL_TIMEOUT',
        'AI_MODEL_RATE_LIMIT',
        'AI_INVALID_OUTPUT',
        'AI_SERVICE_UNAVAILABLE',
      ].includes(code)
    );
  }
}
