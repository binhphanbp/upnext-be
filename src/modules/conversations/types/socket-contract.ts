export const CHAT_SCHEMA_VERSION = 1 as const;

export type ChatAck<T> =
  | { ok: true; data: T; serverTime: string }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
      serverTime: string;
    };

export function successAck<T>(data: T): ChatAck<T> {
  return { ok: true, data, serverTime: new Date().toISOString() };
}

export function errorAck(error: unknown): ChatAck<never> {
  const candidate = error as { response?: { code?: string }; message?: string; status?: number };
  const code = candidate.response?.code ?? mapStatusToCode(candidate.status);
  return {
    ok: false,
    error: {
      code,
      message: candidate.message ?? 'Request failed',
      retryable: code === 'INTERNAL_ERROR' || code === 'RATE_LIMITED',
    },
    serverTime: new Date().toISOString(),
  };
}

function mapStatusToCode(status?: number): string {
  if (status === 401) return 'AUTH_EXPIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}
