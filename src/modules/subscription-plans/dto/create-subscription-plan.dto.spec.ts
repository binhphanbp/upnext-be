import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlanAudience } from '@prisma/client';
import { CreateSubscriptionPlanDto } from './create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './update-subscription-plan.dto';

/**
 * Kiểm ở tầng validator, không phải tầng service: những gì service làm đều chạy SAU
 * `ValidationPipe`, nên một test service không bao giờ phát hiện được rằng payload
 * đã bị chặn từ ngoài. Đúng chỗ đó là lý do gói miễn phí trước đây không tạo được
 * qua API mặc dù service hoàn toàn xử lý được giá 0.
 */
async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSubscriptionPlanDto, payload);
  const errors = await validate(dto, { whitelist: true });
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}).map(() => error.property));
}

const valid = {
  subscriptionName: 'Growth',
  price: 299000,
  durationDays: 30,
};

describe('CreateSubscriptionPlanDto', () => {
  it('chấp nhận payload tối thiểu', async () => {
    expect(await errorsFor(valid)).toEqual([]);
  });

  // Đây là lỗi thật đã chặn việc tạo gói miễn phí qua API.
  it('chấp nhận price = 0 cho gói miễn phí', async () => {
    expect(await errorsFor({ ...valid, price: 0 })).toEqual([]);
  });

  it('vẫn từ chối price âm', async () => {
    expect(await errorsFor({ ...valid, price: -1 })).toContain('price');
  });

  it('chấp nhận audience CANDIDATE', async () => {
    expect(await errorsFor({ ...valid, audience: PlanAudience.CANDIDATE })).toEqual([]);
  });

  it('từ chối audience không có trong enum', async () => {
    expect(await errorsFor({ ...valid, audience: 'EMPLOYER' })).toContain('audience');
  });

  it.each(['RECRUITER_GROWTH', 'B2C_TALENT', 'ABC'])('chấp nhận code hợp lệ %s', async (code) => {
    expect(await errorsFor({ ...valid, code })).toEqual([]);
  });

  // `code` là định danh bất biến mà logic nghiệp vụ dựa vào, nên nó phải trông như
  // một hằng số. Cho phép chữ thường hay dấu cách là mở đường cho đúng kiểu lệch mã
  // mà migration 20260820030000 đã phải đi dọn.
  it.each(['recruiter_growth', 'Recruiter Growth', 'AB', '1RECRUITER', 'RECRUITER-GROWTH'])(
    'từ chối code không hợp lệ %s',
    async (code) => {
      expect(await errorsFor({ ...valid, code })).toContain('code');
    },
  );

  it('từ chối highlightLabel dài quá 60 ký tự', async () => {
    expect(await errorsFor({ ...valid, highlightLabel: 'x'.repeat(61) })).toContain(
      'highlightLabel',
    );
  });

  it('từ chối sortOrder âm', async () => {
    expect(await errorsFor({ ...valid, sortOrder: -1 })).toContain('sortOrder');
  });
});

describe('UpdateSubscriptionPlanDto', () => {
  // `code` và `audience` bị loại có chủ đích: đổi mã của một gói đang chạy làm mọi
  // logic theo bậc gói trỏ vào hư không, và đổi audience nghĩa là chuyển subscription
  // của người dùng sang phía khác của bảng giá.
  it('không nhận code và audience', () => {
    const keys = Object.keys(plainToInstance(UpdateSubscriptionPlanDto, {}));
    expect(keys).not.toContain('code');
    expect(keys).not.toContain('audience');
  });

  it('bỏ code và audience khỏi payload khi whitelist bật', async () => {
    const dto = plainToInstance(UpdateSubscriptionPlanDto, {
      price: 1000,
      code: 'RECRUITER_HACK',
      audience: PlanAudience.CANDIDATE,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property).sort()).toEqual(['audience', 'code']);
  });
});
