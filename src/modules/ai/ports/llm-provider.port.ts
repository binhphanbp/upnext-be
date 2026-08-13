/**
 * Ranh giới giữa logic Copilot và nhà cung cấp LLM.
 *
 * ADR-001 §5.1: module nghiệp vụ chỉ được inject port, không bao giờ inject
 * `GeminiLlmAdapter`. Khi tách service Python hoặc đổi nhà cung cấp, chỉ thêm
 * một adapter mới và đổi một dòng trong DI container.
 *
 * Port cố ý hẹp — đúng hai phép toán. Mọi thứ Copilot cần đều diễn đạt được
 * bằng chúng, và cái gì không diễn đạt được thì thuộc về orchestrator chứ không
 * phải nhà cung cấp.
 */

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmMessage = {
  role: 'user' | 'model';
  text: string;
};

export type StructuredRequest = {
  /** Chỉ dẫn hệ thống. KHÔNG bao giờ chứa dữ liệu người dùng (§16.1). */
  systemInstruction: string;
  messages: LlmMessage[];
  /** JSON Schema kiểu Gemini. Provider buộc output khớp schema này. */
  responseSchema: Record<string, unknown>;
  temperature?: number;
  /** Tier nghiệp vụ do upnext-ai ánh xạ sang model thật; không nhận tên model tuỳ ý. */
  modelTier?: 'fast' | 'quality';
  /** Hồ sơ thực thi có ngân sách/timeout do nền tảng kiểm soát. */
  executionProfile?: 'interactive' | 'batch';
  signal?: AbortSignal;
};

export type StructuredResponse = {
  /** JSON đã parse. Orchestrator còn phải validate lại bằng zod. */
  value: unknown;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
};

export type TextStreamRequest = {
  systemInstruction: string;
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

/**
 * Chunk cuối cùng luôn là `usage`. Trả usage qua stream thay vì qua giá trị
 * return của generator để chỗ tiêu thụ dùng `for await` bình thường được — giá
 * trị return của async generator rất dễ bị bỏ quên.
 */
export type LlmStreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number };

export interface LlmProviderPort {
  /** Tên model thật đang dùng — ghi vào `ai_runs` để tái lập kết quả. */
  readonly modelName: string;

  /** Có cấu hình được không. False thì Copilot trả AI_SERVICE_UNAVAILABLE. */
  isConfigured(): boolean;

  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;

  streamText(request: TextStreamRequest): AsyncGenerator<LlmStreamChunk>;
}
