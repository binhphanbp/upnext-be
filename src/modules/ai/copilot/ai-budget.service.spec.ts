import { ConflictException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiBudgetService } from './ai-budget.service';

/**
 * `ai_runs` đã ghi token từ ngày module này ra đời, nhưng không có gì đọc lại
 * để chặn — xem KE-HOACH-CHONG-LAM-DUNG-AI-CHATBOT.md P0-2. Bộ test này khẳng
 * định phần còn thiếu đó: đọc-và-chặn thật sự chặn, không chỉ ghi log.
 */
describe('AiBudgetService', () => {
  const aggregate = jest.fn();
  const prismaMock = { aIRun: { aggregate } } as unknown as PrismaService;
  const config = new ConfigService({ aiMaxRunsPerDay: 300, aiMaxTokensPerDay: 3_000_000 });

  let service: AiBudgetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiBudgetService(prismaMock, config);
  });

  describe('assertWithinDailyBudget', () => {
    it('cho qua khi chưa chạm hạn mức nào', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 10 },
        _sum: { inputTokens: 5_000, outputTokens: 5_000 },
      });

      await expect(service.assertWithinDailyBudget('candidate-1')).resolves.toBeUndefined();
    });

    it('chặn khi đã đạt số lượt chạy tối đa trong ngày, dù token còn thấp', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 300 },
        _sum: { inputTokens: 100, outputTokens: 100 },
      });

      await expect(service.assertWithinDailyBudget('candidate-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('chặn khi đã đạt tổng token tối đa, dù số lượt chạy còn thấp', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { inputTokens: 2_500_000, outputTokens: 500_000 },
      });

      await expect(service.assertWithinDailyBudget('candidate-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_SERVICE_UNAVAILABLE' }),
      });
    });

    it('coi run/token của ngày hôm qua không tính vào hạn mức hôm nay — query phải lọc theo createdAt', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { inputTokens: 0, outputTokens: 0 },
      });

      await service.assertWithinDailyBudget('candidate-1');

      const [args] = aggregate.mock.calls[0]!;
      expect(args.where.actorId).toBe('candidate-1');
      expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    });

    // Ngưỡng này là cầu dao chi phí, không phải hạn mức gói. Hạn mức người dùng thấy
    // là quota `AI_COPILOT_RUN`. Nếu cầu dao báo về như "bạn đã hết lượt hôm nay" thì
    // người đã trả tiền cho 100 lượt/chu kỳ sẽ thấy một giới hạn thứ hai mà bảng giá
    // không nói tới — và support không có cách nào giải thích.
    it('báo lỗi hệ thống chứ không báo hết hạn mức, và ghi log mức error cho vận hành', async () => {
      aggregate.mockResolvedValue({
        _count: { _all: 300 },
        _sum: { inputTokens: 100, outputTokens: 100 },
      });
      const alert = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.assertWithinDailyBudget('candidate-1')).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'AI_SERVICE_UNAVAILABLE' }),
      });
      expect(alert).toHaveBeenCalledWith(expect.stringContaining('circuit breaker tripped'));

      alert.mockRestore();
    });
  });

  describe('assertBelowBlockedToolThreshold', () => {
    it('cho qua khi chưa có lượt bị chặn nào', async () => {
      aggregate.mockResolvedValue({ _sum: { blockedToolCount: 0 } });
      await expect(service.assertBelowBlockedToolThreshold('candidate-1')).resolves.toBeUndefined();
    });

    it('chặn khi vượt ngưỡng dò tìm tool ngoài quyền, không đợi orchestrator tự phát hiện', async () => {
      aggregate.mockResolvedValue({ _sum: { blockedToolCount: 20 } });

      await expect(service.assertBelowBlockedToolThreshold('candidate-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_TOOL_NOT_ALLOWED' }),
      });
    });

    // Bất đối xứng có chủ đích: dò tìm tool ngoài quyền là tín hiệu BẢO MẬT nhắm vào
    // đúng người gọi, nên nó vẫn là 409 nói thật với họ. Cầu dao chi phí thì là sự cố
    // hệ thống, nên trả 503. Đừng nhập hai thứ này làm một.
    it('giữ tín hiệu bảo mật ở 409, không đổi thành lỗi hệ thống như cầu dao chi phí', async () => {
      aggregate.mockResolvedValue({ _sum: { blockedToolCount: 20 } });

      await expect(service.assertBelowBlockedToolThreshold('candidate-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('null (chưa từng có ai_runs nào) không được coi là vượt ngưỡng', async () => {
      aggregate.mockResolvedValue({ _sum: { blockedToolCount: null } });
      await expect(service.assertBelowBlockedToolThreshold('candidate-1')).resolves.toBeUndefined();
    });
  });
});
