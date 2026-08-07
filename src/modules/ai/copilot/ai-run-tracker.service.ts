import { Injectable } from '@nestjs/common';

/**
 * Đếm số lượt chạy AI đang mở của mỗi ứng viên, chỉ trong bộ nhớ tiến trình.
 *
 * Đúng khi backend chạy một instance — đúng thực tế triển khai hiện tại
 * (`docker-compose.yml` chỉ khai một service `api`). Nếu sau này đứng sau load
 * balancer nhiều instance, bộ đếm này phải chuyển sang Redis (`INCR`/`EXPIRE`):
 * mỗi instance sẽ giữ một `Map` riêng, và trần thực tế sẽ nhân lên theo số
 * instance mà không ai nhận ra. Ghi rõ giới hạn ở đây còn hơn để người sau
 * tưởng nhầm nó đã phân tán được.
 */
@Injectable()
export class AiRunTrackerService {
  private readonly activeRunsByUser = new Map<string, number>();

  tryAcquire(userId: string, maxConcurrent: number): boolean {
    const current = this.activeRunsByUser.get(userId) ?? 0;
    if (current >= maxConcurrent) return false;
    this.activeRunsByUser.set(userId, current + 1);
    return true;
  }

  release(userId: string): void {
    const current = this.activeRunsByUser.get(userId) ?? 0;
    if (current <= 1) this.activeRunsByUser.delete(userId);
    else this.activeRunsByUser.set(userId, current - 1);
  }
}
