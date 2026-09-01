import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyStatus,
  JobBoostEndedReason,
  JobBoostStatus,
  JobBoostType,
  JobStatus,
  ModerationStatus,
  Prisma,
} from '@prisma/client';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { isJobBoostRace, jobBoostRaceError } from './job-boost-race';

/** Đơn vị mua là một lượt tin được đẩy, không phải số ngày -- đúng cách bảng
 * 5.2 gốc đếm ("0/1/3/10" là số lượt). Thời hạn mỗi lượt cố định 7 ngày. */
const BOOST_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class JobBoostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  /**
   * @param idempotencyKey Do client sinh một lần cho mỗi lượt bấm "Đẩy tin"
   *   (khuyến nghị `crypto.randomUUID()`), gửi lại y nguyên khi retry mạng --
   *   khác request (network timeout rồi bấm lại tay) phải dùng key khác. Đây
   *   là điều kiện để idempotency có ý nghĩa: key ổn định qua các lần thử lại
   *   của CÙNG một hành động người dùng, không phải do server tự sinh (trước
   *   đây server tự sinh theo timestamp, nên mỗi lần retry lại là một lượt
   *   tiêu quota mới).
   */
  async createBoost(
    jobId: string,
    user: AuthenticatedUser,
    type: JobBoostType,
    idempotencyKey: string,
  ) {
    if (!user.companyId) throw new ForbiddenException('Not associated with a company');

    const scopedIdempotencyKey = `job-boost:${user.companyId}:${idempotencyKey}`.slice(0, 200);

    // Idempotent replay: cùng key thì trả lại đúng boost đã tạo trước đó,
    // không tiêu thêm quota, không tái kiểm tra điều kiện tin (tin có thể đã
    // đổi trạng thái từ lúc tạo -- replay phải trả về đúng cái đã xảy ra, không
    // phải đánh giá lại từ đầu). Đọc trực tiếp `job_boost.idempotency_key`
    // (không qua `SubscriptionUsage`) vì hai bảng luôn ghi cùng một transaction
    // -- nếu bản ghi này tồn tại thì lượt tiêu quota tương ứng chắc chắn đã
    // commit thành công.
    const existingBoost = await this.prisma.jobBoost.findUnique({
      where: { idempotencyKey: scopedIdempotencyKey },
    });
    if (existingBoost) {
      if (existingBoost.jobPostId !== jobId) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
          message: 'Khóa idempotency này đã dùng cho một yêu cầu khác.',
        });
      }
      return existingBoost;
    }

    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId,
        deletedAt: null,
        isHidden: false,
        moderationStatus: ModerationStatus.APPROVED,
        company: { status: CompanyStatus.ACTIVE },
        OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
      },
      select: { id: true, status: true, companyId: true },
    });
    if (!job) {
      // Tin không tồn tại / không thuộc công ty này VÀ tin tồn tại nhưng
      // không đủ điều kiện công khai (bị ẩn/hết hạn/chưa duyệt) đều trả 404 ở
      // đây để không lộ thông tin nội bộ về tin của công ty khác -- nhưng
      // phân biệt rõ với "chưa PUBLISHED" (409 riêng bên dưới) vì đó là lỗi
      // người dùng có thể tự sửa (bấm đăng tin), không phải lỗi tra cứu.
      const exists = await this.prisma.jobPost.findFirst({
        where: { id: jobId, companyId: user.companyId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!exists) throw new NotFoundException('Job post not found');
      throw new ConflictException({
        code: 'JOB_NOT_ELIGIBLE_FOR_BOOST',
        message: 'Tin này chưa đủ điều kiện đẩy (đã ẩn, hết hạn, hoặc chưa được duyệt).',
      });
    }
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
    // đây là cách duy nhất để `stopBoost()` sau này tra được đúng bản ghi
    // `SubscriptionUsage` của MỘT boost cụ thể, không phải "mới nhất của công
    // ty" -- một công ty đẩy nhiều tin cùng lúc thì "mới nhất" có thể sai.
    const boostId = randomUUID();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { usage } = await this.quota.consume(tx, {
          companyId: user.companyId!,
          feature: SubscriptionFeature.FEATURED_JOB,
          referenceType: 'JOB_BOOST',
          referenceId: boostId,
          idempotencyKey: scopedIdempotencyKey,
          createdByRecruiterId: user.id,
        });

        return tx.jobBoost.create({
          data: {
            id: boostId,
            idempotencyKey: scopedIdempotencyKey,
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
    } catch (error) {
      // `job_boost_one_live_per_job` chặn đúng cuộc đua hai request đồng thời
      // cùng vượt qua pre-check `runningBoost` phía trên rồi cùng cố tạo boost
      // -- Postgres hủy transaction ngay khi vi phạm nên phải bắt ngoài `tx`.
      if (isJobBoostRace(error)) throw jobBoostRaceError();
      throw error;
    }
  }

  /**
   * Dừng một boost trước khi hết hạn tự nhiên. Chính sách hoàn credit (mục 4.3
   * kế hoạch nghiệp vụ): còn ở `SCHEDULED` hoặc `ACTIVE` mà CHƯA từng có
   * impression thì hoàn -- công ty chưa nhận được gì từ lượt đẩy này. Đã có
   * impression thì không hoàn dù dừng sớm: nền tảng đã thực hiện đúng nghĩa vụ
   * phân phối, phần thời gian còn lại không dùng là lựa chọn của recruiter.
   */
  async stopBoost(boostId: string, user: AuthenticatedUser) {
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

    const shouldRefund = boost.firstImpressionAt === null;

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.jobBoost.updateMany({
        where: {
          id: boostId,
          status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
        },
        data: { status: JobBoostStatus.ENDED, endedReason: JobBoostEndedReason.RECRUITER_STOPPED },
      });
      if (!changed.count) {
        throw new ConflictException({
          code: 'JOB_BOOST_NOT_CANCELLABLE',
          message: 'Lượt đẩy tin này đã kết thúc hoặc đã bị hủy.',
        });
      }

      let creditRefunded = false;
      if (shouldRefund) {
        // `referenceId` là `id` của chính boost này -- gắn từ lúc tạo, không
        // phải suy đoán "lượt tiêu gần nhất" (sai khi công ty có nhiều boost
        // cùng lúc).
        const usage = await tx.subscriptionUsage.findFirst({
          where: { referenceType: 'JOB_BOOST', referenceId: boostId },
        });
        if (usage) {
          await this.quota.reverse(tx, usage.id, 'job-boost-stopped-before-impression');
          creditRefunded = true;
        }
      }

      const updated = await tx.jobBoost.findUniqueOrThrow({ where: { id: boostId } });
      return { ...updated, creditRefunded };
    });
  }

  /**
   * Kết thúc sớm boost đang chạy vì bản thân job không còn đủ điều kiện hiển
   * thị công khai (đóng tin, admin ẩn tin, ...) -- gọi từ các hành động vòng
   * đời tin tuyển dụng, không phải hành động của recruiter trên chính boost.
   * Không hoàn credit qua đường này: recruiter tự đóng/vi phạm khiến tin mất
   * điều kiện là hành động của họ, không phải lỗi phân phối của nền tảng.
   * Không lỗi khi không có boost nào đang chạy -- gọi "phòng hờ" ở nhiều nơi.
   */
  async invalidateActiveBoostForJob(
    jobId: string,
    reason: JobBoostEndedReason,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await tx.jobBoost.updateMany({
      where: {
        jobPostId: jobId,
        status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
      },
      data: { status: JobBoostStatus.ENDED, endedReason: reason },
    });
  }

  /** Lịch sử boost của công ty, mới nhất trước -- phục vụ trang quản lý Boost. */
  async listForCompany(
    companyId: string,
    query: { status?: JobBoostStatus; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    const where: Prisma.JobBoostWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobBoost.findMany({
        where,
        include: { jobPost: { select: { id: true, title: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobBoost.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Tổng hợp `JobBoostMetric` theo khoảng ngày cho một boost cụ thể. */
  async getMetrics(boostId: string, companyId: string, range: { from?: Date; to?: Date } = {}) {
    const boost = await this.prisma.jobBoost.findFirst({ where: { id: boostId, companyId } });
    if (!boost) throw new NotFoundException('Job boost not found');

    const metrics = await this.prisma.jobBoostMetric.findMany({
      where: {
        jobBoostId: boostId,
        ...(range.from || range.to
          ? {
              date: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });

    const totals = metrics.reduce(
      (acc, m) => ({
        impressions: acc.impressions + m.impressions,
        clicks: acc.clicks + m.clicks,
        applications: acc.applications + m.applicationsCount,
        saves: acc.saves + m.savedCount,
      }),
      { impressions: 0, clicks: 0, applications: 0, saves: 0 },
    );

    return { boost, daily: metrics, totals };
  }
}
