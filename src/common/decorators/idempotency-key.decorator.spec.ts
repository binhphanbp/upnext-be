import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { IdempotencyKey } from './idempotency-key.decorator';

/**
 * `createParamDecorator` không export factory ra ngoài, nên cách duy nhất để
 * test là lấy lại factory từ metadata mà decorator gắn lên một handler giả.
 */
function extractFactory() {
  class Probe {
    handler(@IdempotencyKey() key: string) {
      return key;
    }
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: (data: unknown, context: ExecutionContext) => string }
  >;
  return Object.values(metadata)[0].factory;
}

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyKey', () => {
  const factory = extractFactory();
  const validKey = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('trả về key khi header là UUID hợp lệ', () => {
    expect(factory(undefined, contextWith({ 'idempotency-key': validKey }))).toBe(validKey);
  });

  it('chuẩn hoá về chữ thường để một key không tạo hai bản ghi quota', () => {
    // `SubscriptionUsage.idempotencyKey` là unique trên chuỗi, nên cùng một UUID
    // viết hoa và viết thường sẽ là hai key khác nhau và charge hai lần.
    expect(factory(undefined, contextWith({ 'idempotency-key': validKey.toUpperCase() }))).toBe(
      validKey,
    );
  });

  it('bỏ khoảng trắng ở hai đầu', () => {
    expect(factory(undefined, contextWith({ 'idempotency-key': `  ${validKey}  ` }))).toBe(
      validKey,
    );
  });

  it.each([
    ['thiếu header', {}],
    ['header rỗng', { 'idempotency-key': '' }],
    ['header chỉ có khoảng trắng', { 'idempotency-key': '   ' }],
  ])('từ chối với IDEMPOTENCY_KEY_REQUIRED khi %s', (_label, headers) => {
    expect(() => factory(undefined, contextWith(headers))).toThrow(BadRequestException);
    try {
      factory(undefined, contextWith(headers));
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }
  });

  it.each([
    ['không phải UUID', 'abc-123'],
    ['UUID thiếu ký tự', '3f2504e0-4f89-41d3-9a0c-0305e82c330'],
    ['nil UUID', '00000000-0000-0000-0000-000000000000'],
  ])('từ chối với IDEMPOTENCY_KEY_INVALID khi %s', (_label, value) => {
    try {
      factory(undefined, contextWith({ 'idempotency-key': value }));
      throw new Error('lẽ ra phải ném lỗi');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    }
  });

  it('từ chối khi header xuất hiện nhiều lần thay vì đoán lấy giá trị đầu', () => {
    // Hai key khác nhau trong một request là lỗi của client. Lặng lẽ chọn cái
    // đầu tiên nghĩa là hai lần retry với hai key có thể charge hai lần.
    const other = '9c858901-8a57-4791-81fe-4c455b099bc9';
    try {
      factory(undefined, contextWith({ 'idempotency-key': [validKey, other] }));
      throw new Error('lẽ ra phải ném lỗi');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    }
  });
});
