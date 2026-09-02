import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeywordAnalyticsService } from './keyword-analytics.service';

const DAY = 24 * 60 * 60 * 1000;

describe('KeywordAnalyticsService', () => {
  let service: KeywordAnalyticsService;
  let prismaMock: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaMock = { $queryRaw: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [KeywordAnalyticsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(KeywordAnalyticsService);
  });

  describe('khoảng thời gian', () => {
    it('mặc định lấy `days` ngày gần nhất', async () => {
      const { from, to } = await service.getZeroResultKeywords({ days: 7, limit: 20 });

      const spanDays = Math.round((to.getTime() - from.getTime()) / DAY);
      expect(spanDays).toBe(7);
    });

    it('đòi cả from và to khi dùng khoảng tùy chọn', async () => {
      // Chỉ có một đầu thì không suy ra được đầu kia — đoán hộ người dùng ở đây là sai.
      await expect(
        service.getZeroResultKeywords({ days: 30, limit: 20, from: '2026-08-01' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getZeroResultKeywords({ days: 30, limit: 20, to: '2026-08-31' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khoảng ngược đầu', async () => {
      await expect(
        service.getZeroResultKeywords({
          days: 30,
          limit: 20,
          from: '2026-08-31',
          to: '2026-08-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lấy hết ngày cuối của khoảng tùy chọn', async () => {
      const { to } = await service.getZeroResultKeywords({
        days: 30,
        limit: 20,
        from: '2026-08-01',
        to: '2026-08-31',
      });

      // Không đẩy tới 23:59:59 thì mọi lượt tìm trong ngày cuối bị loại khỏi báo cáo.
      expect(to.getHours()).toBe(23);
      expect(to.getMinutes()).toBe(59);
    });

    it('từ chối ngày không hợp lệ', async () => {
      await expect(
        service.getZeroResultKeywords({ days: 30, limit: 20, from: 'hôm qua', to: 'hôm nay' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOverview', () => {
    it('so với khoảng liền trước có cùng độ dài', async () => {
      const result = await service.getOverview({ days: 30, limit: 20 });

      const span = result.to.getTime() - result.from.getTime();
      const previousSpan = result.previousRange.to.getTime() - result.previousRange.from.getTime();

      // Kỳ trước phải dài đúng bằng kỳ đang xem, và kết thúc ngay khi kỳ này bắt đầu —
      // so 30 ngày với 7 ngày thì phần trăm thay đổi vô nghĩa.
      expect(previousSpan).toBe(span);
      expect(result.previousRange.to.getTime()).toBe(result.from.getTime());
    });

    it('trả về số 0 thay vì undefined khi chưa có log nào', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await service.getOverview({ days: 30, limit: 20 });

      expect(result.current).toEqual({
        searchCount: 0,
        uniqueVisitors: 0,
        distinctKeywords: 0,
        zeroResultSearches: 0,
      });
    });

    it('chạy hai truy vấn: kỳ này và kỳ trước', async () => {
      await service.getOverview({ days: 30, limit: 20 });

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTrend', () => {
    it('coi từ khóa rỗng là không lọc', async () => {
      const result = await service.getTrend({ days: 7, limit: 20, keyword: '   ' });

      // Chuỗi trắng phải thành null, nếu không truy vấn sẽ đi tìm từ khóa tên là khoảng trắng.
      expect(result.keyword).toBeNull();
    });

    it('giữ nguyên từ khóa đã cho', async () => {
      const result = await service.getTrend({ days: 7, limit: 20, keyword: 'reactjs' });

      expect(result.keyword).toBe('reactjs');
    });
  });
});
