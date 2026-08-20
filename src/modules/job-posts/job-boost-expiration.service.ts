import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobBoostStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Chuyển `ACTIVE -> ENDED` khi qua `endsAt`. Không hoàn quota ở đây: hết hạn
 * tự nhiên nghĩa là recruiter đã dùng đủ thời gian đã mua -- khác với hủy sớm
 * (`JobBoostService.cancelBoost`), nơi có hoàn vì thời gian mua chưa dùng hết.
 */
@Injectable()
export class JobBoostExpirationService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async endExpiredBoosts() {
    const expired = await this.prisma.jobBoost.findMany({
      where: { status: JobBoostStatus.ACTIVE, endsAt: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const boost of expired) {
      await this.prisma.$transaction(async (tx) => this.markEnded(tx, boost.id));
    }
  }

  private async markEnded(tx: Prisma.TransactionClient, id: string) {
    await tx.jobBoost.updateMany({
      where: { id, status: JobBoostStatus.ACTIVE, endsAt: { lte: new Date() } },
      data: { status: JobBoostStatus.ENDED },
    });
  }
}
