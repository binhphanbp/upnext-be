import { ConflictException } from '@nestjs/common';
import { PlanAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';

function buildPrisma() {
  const planFeature = {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  };
  const subscriptionPlan = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'plan-1', features: [] }),
    create: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    update: jest.fn().mockResolvedValue({ id: 'plan-1' }),
  };
  return {
    subscriptionPlan,
    planFeature,
    $transaction: jest.fn(
      (
        callback: (tx: {
          planFeature: typeof planFeature;
          subscriptionPlan: typeof subscriptionPlan;
        }) => unknown,
      ) => callback({ planFeature, subscriptionPlan }),
    ),
  };
}

const baseDto: CreateSubscriptionPlanDto = {
  subscriptionName: 'Growth',
  price: 299000,
  durationDays: 30,
};

describe('SubscriptionPlansService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: SubscriptionPlansService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new SubscriptionPlansService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    // Gói miễn phí là một bản ghi thật, và `provisionFreeSubscription()` chọn gói theo
    // `price = 0`. Trước bản này `price` có `@IsPositive()` nên gói miễn phí KHÔNG
    // tạo được qua API -- nó chỉ tồn tại được bằng seed hoặc migration.
    it('tạo được gói giá 0', async () => {
      await service.create('admin-1', { ...baseDto, subscriptionName: 'Miễn phí', price: 0 });

      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: new Prisma.Decimal(0) }),
        }),
      );
    });

    it('tạo được gói cho ứng viên, không mặc định về recruiter', async () => {
      await service.create('admin-1', { ...baseDto, audience: PlanAudience.CANDIDATE });

      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ audience: PlanAudience.CANDIDATE }),
        }),
      );
    });

    it('thiếu audience thì mặc định RECRUITER', async () => {
      await service.create('admin-1', baseDto);

      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ audience: PlanAudience.RECRUITER }),
        }),
      );
    });

    it('luôn tạo quyền đăng tin không giới hạn cho gói recruiter mới', async () => {
      await service.create('admin-1', { ...baseDto, jobPostLimit: 99 });

      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobPostLimit: 0,
            features: {
              create: {
                feature: SubscriptionFeature.JOB_POST,
                enabled: true,
                limitValue: null,
              },
            },
          }),
        }),
      );
    });

    // Trùng tên chỉ tính trong cùng audience: "Miễn phí" tồn tại hợp lệ ở cả hai phía.
    it('cho phép cùng tên ở hai audience khác nhau', async () => {
      await service.create('admin-1', {
        ...baseDto,
        subscriptionName: 'Miễn phí',
        audience: PlanAudience.CANDIDATE,
      });

      expect(prisma.subscriptionPlan.findFirst).toHaveBeenCalledWith({
        where: { subscriptionName: 'Miễn phí', audience: PlanAudience.CANDIDATE },
      });
    });

    it('chặn trùng tên trong cùng audience', async () => {
      prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create('admin-1', baseDto)).rejects.toMatchObject({
        response: { code: 'PLAN_NAME_TAKEN' },
      });
      expect(prisma.subscriptionPlan.create).not.toHaveBeenCalled();
    });

    // `code` có unique constraint ở DB. Không kiểm trước thì Prisma ném P2002 và
    // admin nhận 500 cho một lỗi nhập liệu bình thường.
    it('chặn trùng code với lỗi đọc được, không để P2002 lọt ra thành 500', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('admin-1', { ...baseDto, code: 'RECRUITER_GROWTH' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.subscriptionPlan.create).not.toHaveBeenCalled();
    });

    it('không có code thì không truy vấn kiểm trùng code', async () => {
      await service.create('admin-1', baseDto);

      expect(prisma.subscriptionPlan.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'plan-1', features: [] });
    });

    // `dto.price ? ... : {}` coi 0 là falsy, nên cách viết cũ âm thầm bỏ qua mọi lần
    // hạ một gói về miễn phí: API trả 200, giá không đổi, và không có lỗi nào.
    it('hạ giá về 0 phải thực sự được ghi', async () => {
      await service.update('plan-1', { price: 0 });

      expect(prisma.subscriptionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: new Prisma.Decimal(0) }),
        }),
      );
    });

    it('không gửi price thì không đụng tới giá', async () => {
      await service.update('plan-1', { subscriptionName: 'Growth+' });

      const [[call]] = prisma.subscriptionPlan.update.mock.calls as [[{ data: object }]];
      expect(call.data).not.toHaveProperty('price');
    });

    it('bỏ qua jobPostLimit legacy được gửi từ API', async () => {
      await service.update('plan-1', { jobPostLimit: 99 });

      const [[call]] = prisma.subscriptionPlan.update.mock.calls as [[{ data: object }]];
      expect(call.data).not.toHaveProperty('jobPostLimit');
    });
  });

  describe('setFeatures', () => {
    beforeEach(() => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        audience: PlanAudience.RECRUITER,
        features: [],
      });
    });

    it('forces job posting to stay enabled and unlimited for recruiter plans', async () => {
      await service.setFeatures('plan-1', {
        features: [
          { feature: SubscriptionFeature.JOB_POST, enabled: false, limitValue: 1 },
          { feature: SubscriptionFeature.AI_JD_GENERATE, enabled: true, limitValue: 5 },
        ],
      });

      expect(prisma.planFeature.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            planId_feature: { planId: 'plan-1', feature: SubscriptionFeature.JOB_POST },
          },
          update: { enabled: true, limitValue: null },
          create: {
            planId: 'plan-1',
            feature: SubscriptionFeature.JOB_POST,
            enabled: true,
            limitValue: null,
          },
        }),
      );
    });
  });
});
