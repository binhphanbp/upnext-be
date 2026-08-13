import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProviderPort,
  LlmStreamChunk,
  StructuredRequest,
  StructuredResponse,
  TextStreamRequest,
} from '../../ports/llm-provider.port';

/**
 * Hiện thực `LlmProviderPort` bằng Gemini REST API.
 *
 * Theo đúng khuôn đã dùng ở `job-post-ai/gemini-job-post.service.ts` — `fetch`
 * thô, không SDK. Giữ nguyên lựa chọn đó có lý do: không lock-in vào một client
 * library, và request/response nhìn thấy được khi debug.
 *
 * Model rẻ cho việc phân loại intent, model tốt hơn cho câu trả lời. Đây là
 * phân tầng ở KE-HOACH-AI-REVIEW.md §25 — không đặt một model mạnh cho mọi việc.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ROUTING_MODEL = 'gemini-2.5-flash-lite';
const ANSWER_MODEL = 'gemini-2.5-flash';
const STRUCTURED_TIMEOUT_MS = 45_000;
/** §13.4 — tối đa 20 giây cho một request tương tác. */
const STREAM_TIMEOUT_MS = 20_000;

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: GeminiUsage;
  promptFeedback?: { blockReason?: string };
};

@Injectable()
export class GeminiLlmAdapter implements LlmProviderPort {
  private readonly logger = new Logger(GeminiLlmAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  /** Model dùng cho câu trả lời — đây là con số ghi vào log run. */
  readonly modelName = ANSWER_MODEL;

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  private apiKey(): string | null {
    return this.configService.get<string>('geminiApiKey')?.trim() || null;
  }

  /**
   * Ghép AbortSignal của caller với timeout riêng. Nếu chỉ dùng signal của
   * caller thì một request treo sẽ giữ kết nối mãi; nếu chỉ dùng timeout thì
   * người dùng bấm "Dừng" không có tác dụng.
   */
  private linkedSignal(timeoutMs: number, external?: AbortSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const forward = () => controller.abort(external?.reason);
    if (external?.aborted) forward();
    else external?.addEventListener('abort', forward, { once: true });
    return {
      signal: controller.signal,
      release: () => {
        clearTimeout(timer);
        external?.removeEventListener('abort', forward);
      },
    };
  }

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('GEMINI_NOT_CONFIGURED');
    const model = request.modelTier === 'quality' ? ANSWER_MODEL : ROUTING_MODEL;

    const { signal, release } = this.linkedSignal(STRUCTURED_TIMEOUT_MS, request.signal);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: request.messages.map((message) => ({
              role: message.role,
              parts: [{ text: message.text }],
            })),
            generationConfig: {
              temperature: request.temperature ?? 0,
              candidateCount: 1,
              responseMimeType: 'application/json',
              responseSchema: request.responseSchema,
            },
          }),
        },
      );

      if (!response.ok) {
        throw this.httpError(response.status, await response.text().catch(() => ''));
      }

      const body = (await response.json()) as GeminiResponse;
      const text = this.joinParts(body).trim();
      if (!text) throw new Error('AI_INVALID_OUTPUT');

      return {
        value: JSON.parse(text) as unknown,
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        modelName: model,
      };
    } finally {
      release();
    }
  }

  async *streamText(request: TextStreamRequest): AsyncGenerator<LlmStreamChunk> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('GEMINI_NOT_CONFIGURED');

    const { signal, release } = this.linkedSignal(STREAM_TIMEOUT_MS, request.signal);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${ANSWER_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemInstruction }] },
            contents: request.messages.map((message) => ({
              role: message.role,
              parts: [{ text: message.text }],
            })),
            generationConfig: {
              temperature: request.temperature ?? 0.4,
              candidateCount: 1,
              maxOutputTokens: request.maxOutputTokens ?? 2048,
              /**
               * Tắt "thinking".
               *
               * Gemini 2.5 tính token suy nghĩ **vào chung** `maxOutputTokens`.
               * Để mặc định, model đốt gần hết ngân sách vào phần suy nghĩ ẩn và
               * câu trả lời bị cắt giữa câu — quan sát được: 87 token đầu ra cho
               * một câu trả lời dừng ở giữa danh sách.
               *
               * Ở đây không cần suy nghĩ dài: mọi dữ liệu đã được tool lấy sẵn và
               * điểm số đã tính xong, việc của model chỉ là diễn đạt lại. Tắt đi
               * vừa hết cắt câu, vừa giảm độ trễ và chi phí.
               */
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );

      if (!response.ok) {
        throw this.httpError(response.status, await response.text().catch(() => ''));
      }
      if (!response.body) throw new Error('AI_SERVICE_UNAVAILABLE');

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const payload of this.readSseLines(response.body)) {
        let frame: GeminiResponse;
        try {
          frame = JSON.parse(payload) as GeminiResponse;
        } catch {
          // Một frame méo không nên làm sập cả lượt trả lời.
          this.logger.warn('Bỏ qua frame SSE không parse được từ Gemini');
          continue;
        }

        if (frame.promptFeedback?.blockReason) {
          throw new Error('AI_CONTENT_BLOCKED');
        }

        const text = this.joinParts(frame);
        if (text) yield { kind: 'text', text };

        if (frame.usageMetadata) {
          inputTokens = frame.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = frame.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
      }

      yield { kind: 'usage', inputTokens, outputTokens };
    } finally {
      release();
    }
  }

  /**
   * Gemini trả SSE dạng `data: {...}` phân tách bằng dòng trống. Tự tách thay vì
   * dùng thư viện vì cần xử lý chunk bị cắt giữa một dòng — điều xảy ra thường
   * xuyên trên mạng thật và là nguồn lỗi im lặng nếu chỉ split theo '\n'.
   */
  private async *readSseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line.startsWith('data:')) {
            const payload = line.slice(5).trim();
            if (payload && payload !== '[DONE]') yield payload;
          }
          newline = buffer.indexOf('\n');
        }
      }

      const tail = buffer.trim();
      if (tail.startsWith('data:')) {
        const payload = tail.slice(5).trim();
        if (payload && payload !== '[DONE]') yield payload;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ghép các `part` của một frame. **Không cắt khoảng trắng.**
   *
   * Với streaming, mỗi frame là một mẩu của câu đang viết dở và khoảng trắng
   * đầu mẩu chính là dấu cách giữa hai từ. `.trim()` ở đây làm "Mình" + " đã"
   * thành "Mìnhđã" — lỗi chỉ lộ ra khi đọc câu trả lời thật, vì mỗi mẩu tách
   * riêng vẫn đúng.
   *
   * Chỗ cần chuỗi sạch (parse JSON) tự trim lấy.
   */
  private joinParts(body: GeminiResponse): string {
    return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  }

  /**
   * Dịch mã HTTP thành mã lỗi nội bộ để orchestrator hiện đúng thông báo —
   * 429 là "hết hạn mức", 503 là "mất dịch vụ", hai thứ khác nhau với người dùng.
   */
  private httpError(status: number, body: string): Error {
    this.logger.error(`Gemini trả ${status}: ${body.slice(0, 300)}`);
    if (status === 429) return new Error('AI_MODEL_RATE_LIMIT');

    /**
     * Google dùng HTTP 400 cho cả lỗi request thật sự và các điều kiện hạ tầng
     * như egress IP không thuộc vùng được hỗ trợ (`FAILED_PRECONDITION`).
     * Không được báo trường hợp thứ hai là "đầu ra AI không hợp lệ": response
     * chưa hề được tạo, và người dùng cần nhận thông báo dịch vụ tạm thời không
     * khả dụng để có thể thử lại sau.
     */
    if (status === 400 && this.isFailedPrecondition(body)) {
      return new Error('AI_SERVICE_UNAVAILABLE');
    }
    if (status === 400) return new Error('AI_INVALID_OUTPUT');
    return new Error('AI_SERVICE_UNAVAILABLE');
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
