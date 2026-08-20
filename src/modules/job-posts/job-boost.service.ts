import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobBoostStatus, JobBoostType, JobStatus } from '@prisma/client';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';

/** Đơn vị mua là một lượt tin được đẩy, không phải số ngày -- đúng cách bảng
 * 5.2 gốc đếm ("0/1/3/10" là số lượt). Thời hạn mỗi lượt cố định 7 ngày. */
const BOOST_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class JobBoostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  async createBoost(jobId: string, user: AuthenticatedUser, type: JobBoostType) {
    if (!user.companyId) throw new ForbiddenException('Not associated with a company');

    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobId, companyId: user.companyId, deletedAt: null },
      select: { id: true, status: true, companyId: true },
    });
    if (!job) throw new NotFoundException('Job post not found');
    if (job.status !== JobStatus.PUBLISHED) {
      throw new ConflictException({
        code: 'JOB_NOT_PUBLISHED',
        message: 'Chỉ tin đang hiển thị công khai mới đẩy được.',
      });
    }

    const runningBoost = await this.prisma.jobBoost.findFirst({
      where: {
        jobPostId: jobId,
        status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
      },
      select: { id: true, endsAt: true },
    });
    if (runningBoost) {
      throw new ConflictException({
        code: 'JOB_BOOST_ALREADY_ACTIVE',
        message: `Tin này đang được đẩy tới ${runningBoost.endsAt.toISOString()}.`,
      });
    }

    const now = new Date();
    // Sinh `id` trước và dùng chính nó làm `referenceId` của lượt tiêu quota:
    // đây là cách duy nhất để `cancelBoost()` sau này tra được đúng bản ghi
    // `SubscriptionUsage` của MỘT boost cụ thể, không phải "mới nhất của công
    // ty" -- một công ty đẩy nhiều tin cùng lúc thì "mới nhất" có thể sai.
    const boostId = randomUUID();
    const idempotencyKey = `job-boost:${jobId}:${now.getTime()}`;

    return this.prisma.$transaction(async (tx) => {
      const { usage } = await this.quota.consume(tx, {
        companyId: user.companyId!,
        feature: SubscriptionFeature.FEATURED_JOB,
        referenceType: 'JOB_BOOST',
        referenceId: boostId,
        idempotencyKey,
        createdByRecruiterId: user.id,
      });

      return tx.jobBoost.create({
        data: {
          id: boostId,
          createdByRecruiterId: user.id,
          companySubscriptionId: usage.companySubscriptionId,
          jobPostId: jobId,
          companyId: job.companyId,
          type,
          status: JobBoostStatus.ACTIVE,
          creditCost: 1,
          startsAt: now,
          endsAt: new Date(now.getTime() + BOOST_DURATION_MS),
        },
      });
    });
  }

  /**
   * Hủy một boost trước khi hết hạn -- hoàn quota vì recruiter chưa nhận đủ
   * thời gian đã mua. Không dùng cho boost đã `ENDED` tự nhiên (đã dùng đủ,
   * không hoàn -- xem `JobBoostExpirationService`).
   */
  async cancelBoost(boostId: string, user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException('Not associated with a company');

    const boost = await this.prisma.jobBoost.findFirst({
      where: { id: boostId, companyId: user.companyId },
    });
    if (!boost) throw new NotFoundException('Job boost not found');
    if (boost.status !== JobBoostStatus.SCHEDULED && boost.status !== JobBoostStatus.ACTIVE) {
      throw new ConflictException({
        code: 'JOB_BOOST_NOT_CANCELLABLE',
        message: 'Lượt đẩy tin này đã kết thúc hoặc đã bị hủy.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.jobBoost.updateMany({
        where: {
          id: boostId,
          status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
        },
        data: { status: JobBoostStatus.CANCELLED },
      });
      if (!changed.count) {
        throw new ConflictException({
          code: 'JOB_BOOST_NOT_CANCELLABLE',
          message: 'Lượt đẩy tin này đã kết thúc hoặc đã bị hủy.',
        });
      }

      // `referenceId` là `id` của chính boost này -- gắn từ lúc tạo, không phải
      // suy đoán "lượt tiêu gần nhất" (sai khi công ty có nhiều boost cùng lúc).
      const usage = await tx.subscriptionUsage.findFirst({
        where: { referenceType: 'JOB_BOOST', referenceId: boostId },
      });
      if (usage) await this.quota.reverse(tx, usage.id, 'job-boost-cancelled');

      return tx.jobBoost.findUniqueOrThrow({ where: { id: boostId } });
    });
  }
}
