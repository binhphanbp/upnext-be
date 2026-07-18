import { BadRequestException } from '@nestjs/common';

export type ConversationCursor = { createdAt: Date; id: string };

export function encodeCursor(value: ConversationCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id }),
  ).toString('base64url');
}

export function decodeCursor(value: string): ConversationCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    const createdAt = new Date(parsed.createdAt ?? '');
    if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor');
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
