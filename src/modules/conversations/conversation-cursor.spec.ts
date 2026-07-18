import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './conversation-cursor';

describe('conversation cursor', () => {
  it('round trips a stable compound cursor', () => {
    const value = { createdAt: new Date('2026-07-17T10:00:00.000Z'), id: 'message-id' };
    expect(decodeCursor(encodeCursor(value))).toEqual(value);
  });

  it.each(['', 'not-base64-json', Buffer.from('{}').toString('base64url')])(
    'rejects invalid cursor %p',
    (value) => {
      expect(() => decodeCursor(value)).toThrow(BadRequestException);
    },
  );
});
