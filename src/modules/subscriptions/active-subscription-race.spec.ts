import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activeSubscriptionRaceError, isActiveSubscriptionRace } from './active-subscription-race';

function uniqueViolation(target: string | string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('isActiveSubscriptionRace', () => {
  it('nhận diện cuộc đua trên partial unique index của công ty', () => {
    expect(
      isActiveSubscriptionRace(uniqueViolation('company_subscriptions_one_active_per_company_uq')),
    ).toBe(true);
  });

  it('nhận diện cuộc đua trên partial unique index của ứng viên', () => {
    expect(
      isActiveSubscriptionRace(
        uniqueViolation(['candidate_subscriptions_one_active_per_profile_uq']),
      ),
    ).toBe(true);
  });

  // Đây là lý do phải kiểm tên index chứ không chỉ kiểm mã P2002: trùng
  // `(audience, ownerId, idempotencyKey)` trên `subscription_checkouts` có nghĩa
  // nghiệp vụ hoàn toàn khác (IDEMPOTENCY_KEY_REUSED) và đã được xử lý riêng.
  // Nuốt nó vào nhánh "thử lại đi" sẽ che mất một lỗi thật của client.
  it('KHÔNG nhận vơ một P2002 khác, ví dụ trùng idempotency key của checkout', () => {
    expect(
      isActiveSubscriptionRace(uniqueViolation(['audience', 'owner_id', 'idempotency_key'])),
    ).toBe(false);
  });

  it('bỏ qua lỗi không phải P2002 và giá trị không phải lỗi Prisma', () => {
    const other = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    expect(isActiveSubscriptionRace(other)).toBe(false);
    expect(isActiveSubscriptionRace(new Error('boom'))).toBe(false);
    expect(isActiveSubscriptionRace(undefined)).toBe(false);
  });

  it('không vỡ khi meta.target thiếu', () => {
    const noMeta = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(isActiveSubscriptionRace(noMeta)).toBe(false);
  });
});

describe('activeSubscriptionRaceError', () => {
  // 409 chứ không phải 500: một request khác vừa kích hoạt xong cho đúng chủ sở
  // hữu này. Thử lại sẽ thấy bản ghi đó và thành công, nên đây không phải sự cố.
  it('là 409 với mã đọc được, không phải lỗi hệ thống', () => {
    const error = activeSubscriptionRaceError();

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_ACTIVATION_RACE' });
  });
});
