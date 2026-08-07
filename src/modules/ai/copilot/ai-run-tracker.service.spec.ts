import { AiRunTrackerService } from './ai-run-tracker.service';

describe('AiRunTrackerService', () => {
  let tracker: AiRunTrackerService;

  beforeEach(() => {
    tracker = new AiRunTrackerService();
  });

  it('cho phép chạy đến đúng trần rồi từ chối lượt tiếp theo', () => {
    expect(tracker.tryAcquire('user-1', 2)).toBe(true);
    expect(tracker.tryAcquire('user-1', 2)).toBe(true);
    expect(tracker.tryAcquire('user-1', 2)).toBe(false);
  });

  it('giải phóng một slot thì lượt tiếp theo lại được nhận', () => {
    tracker.tryAcquire('user-1', 1);
    expect(tracker.tryAcquire('user-1', 1)).toBe(false);

    tracker.release('user-1');
    expect(tracker.tryAcquire('user-1', 1)).toBe(true);
  });

  it('mỗi user có trần riêng — user khác không bị ảnh hưởng', () => {
    tracker.tryAcquire('user-1', 1);
    expect(tracker.tryAcquire('user-1', 1)).toBe(false);
    expect(tracker.tryAcquire('user-2', 1)).toBe(true);
  });

  it('release nhiều lần hơn acquire không làm slot âm', () => {
    tracker.release('user-chua-tung-acquire');
    expect(tracker.tryAcquire('user-chua-tung-acquire', 1)).toBe(true);
  });
});
