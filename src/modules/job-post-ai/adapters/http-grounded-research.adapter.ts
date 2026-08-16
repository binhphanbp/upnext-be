import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  GroundedResearchProviderPort,
  GroundedResearchRequest,
  GroundedResearchResponse,
  GroundedSource,
} from '../ports/grounded-research-provider.port';

const DEFAULT_TIMEOUT_MS = 75_000;
const MAX_SOURCES = 8;

type ServiceResponse = {
  text: string;
  sources: Array<{ title?: unknown; url?: unknown }>;
  searchQueries: unknown[];
  inputTokens: number;
  outputTokens: number;
  model: string;
};

/** Private client for the one grounded-research capability; never accepts browser JWTs. */
@Injectable()
export class HttpGroundedResearchAdapter implements GroundedResearchProviderPort {
  private readonly logger = new Logger(HttpGroundedResearchAdapter.name);
  readonly modelName = 'upnext-ai/gemini';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl() && this.internalSecret());
  }

  async generateGrounded(request: GroundedResearchRequest): Promise<GroundedResearchResponse> {
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
          temperature: request.temperature,
        }),
        signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`upnext-ai grounded research returned ${response.status}`, {
          responseBytes: body.length,
        });
        throw new Error(this.serviceError(response.status, body));
      }

      const body = (await response.json()) as ServiceResponse;
      if (
        !body ||
        typeof body.text !== 'string' ||
        !Array.isArray(body.sources) ||
        !Array.isArray(body.searchQueries) ||
        !Number.isFinite(body.inputTokens) ||
        !Number.isFinite(body.outputTokens) ||
        typeof body.model !== 'string'
      ) {
        throw new Error('AI_INVALID_OUTPUT');
      }

      return {
        text: body.text,
        // The evidence is re-validated here rather than trusted: it is provider-supplied
        // content that ends up in front of a recruiter, and the caller counts it to decide
        // how much confidence to attach to a salary figure.
        sources: this.normalizeSources(body.sources),
        searchQueries: body.searchQueries
          .filter((query): query is string => typeof query === 'string')
          .map((query) => query.trim())
          .filter(Boolean),
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

  private normalizeSources(sources: ServiceResponse['sources']): GroundedSource[] {
    const unique = new Map<string, GroundedSource>();
    for (const source of sources) {
      const title = typeof source?.title === 'string' ? source.title.trim().slice(0, 200) : '';
      const url = typeof source?.url === 'string' ? source.url.trim() : '';
      if (!title || !isHttpUrl(url) || unique.has(url)) continue;
      unique.set(url, { title, url });
      if (unique.size >= MAX_SOURCES) break;
    }
    return Array.from(unique.values());
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
    return new URL('/internal/v1/research/grounded', `${baseUrl}/`).toString();
  }

  private serviceToken(): Promise<string> {
    const secret = this.internalSecret();
    if (!secret) return Promise.reject(new Error('AI_SERVICE_UNAVAILABLE'));
    return this.jwtService.signAsync(
      {
        scope: 'research:grounded',
        environment: this.configService.get<string>('appEnv'),
        jti: randomUUID(),
      },
      {
        secret,
        issuer: 'upnext-be',
        audience: 'upnext-ai',
        subject: 'upnext-be',
        // A grounded run outlives the usual 60s token, and the service rejects a token that
        // expires mid-flight, so the lifetime is aligned with the request budget.
        expiresIn: '90s',
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
      this.configService.get<number>('aiGroundedResearchTimeoutMs') ?? DEFAULT_TIMEOUT_MS,
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
        'AI_PROVIDER_REGION_BLOCKED',
      ].includes(code)
    );
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
