import { Injectable, Logger } from '@nestjs/common';
import { JobBoostEventType, JobBoostPlacement, JobBoostStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobPostsService } from './job-posts.service';
import { JobBoostDeliveryService } from './job-boost-delivery.service';

/** Tối đa số slot tài trợ hiện ra mỗi lần gọi -- mục 5.1 kế hoạch: 2 slot/khu vực. */
const MAX_SPONSORED_SLOTS = 2;
/** Lấy dư ra để còn chỗ lọc "mỗi công ty tối đa 1 trong số slot trả về". */
const CANDIDATE_POOL_SIZE = 10;

export type SponsoredJobsQuery = {
  placement: JobBoostPlacement;
  keyword?: string;
  location?: string;
};

@Injectable()
export class SponsoredJobsService {
  private readonly logger = new Logger(SponsoredJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobPostsService: JobPostsService,
    private readonly delivery: JobBoostDeliveryService,
  ) {}

  /**
   * Chọn tối đa {@link MAX_SPONSORED_SLOTS} boost đang `ACTIVE` để phân phối,
   * xoay vòng công bằng theo `lastServedAt ASC` (mục 5.3: công ty trả tiền
   * ngang nhau thì cơ hội hiển thị ngang nhau theo thời gian, không phải
   * "ai tạo boost trước được ưu tiên mãi mãi"), tối đa 1 công ty/slot trả về,
   * và cập nhật `lastServedAt` ngay cho các boost được chọn.
   *
   * Chỉ xét job đủ điều kiện công khai (`publicJobEligibilityWhere`) -- một
   * job vừa bị đóng/ẩn biến mất khỏi khu tài trợ ngay cùng lúc với danh sách
   * organic, không cần một cron riêng dọn dẹp.
   */
  async getSponsoredJobs(query: SponsoredJobsQuery) {
    const keyword = query.keyword?.trim();
    const location = query.location?.trim();
    const locationTerms = location ? this.jobPostsService.locationSearchTerms(location) : [];

    const jobWhere: Prisma.JobPostWhereInput = {
      ...this.jobPostsService.publicJobEligibilityWhere(),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { company: { name: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(locationTerms.length > 0
        ? {
            jobPostLocations: {
              some: {
                jobLocation: {
                  OR: locationTerms.map((term) => ({
                    city: { contains: term, mode: 'insensitive' as const },
                  })),
                },
              },
            },
          }
        : {}),
    };

    const candidates = await this.prisma.jobBoost.findMany({
      where: { status: JobBoostStatus.ACTIVE, jobPost: jobWhere },
      select: { id: true, type: true, companyId: true },
      orderBy: [
        { lastServedAt: { sort: 'asc', nulls: 'first' } },
        { startsAt: 'asc' },
        { id: 'asc' },
      ],
      take: CANDIDATE_POOL_SIZE,
    });

    const seenCompanies = new Set<string>();
    const selected = candidates.filter((candidate) => {
      if (seenCompanies.has(candidate.companyId)) return false;
      seenCompanies.add(candidate.companyId);
      return true;
    });
    selected.length = Math.min(selected.length, MAX_SPONSORED_SLOTS);

    if (selected.length === 0) return [];

    const now = new Date();
    const selectedIds = selected.map((s) => s.id);
    await this.prisma.jobBoost.updateMany({
      where: { id: { in: selectedIds } },
      data: { lastServedAt: now },
    });

    const boostRows = await this.prisma.jobBoost.findMany({
      where: { id: { in: selectedIds } },
      select: {
        id: true,
        type: true,
        jobPost: { include: this.jobPostsService.publicJobPostInclude() },
      },
    });

    return boostRows
      .filter((row) => row.jobPost !== null)
      .map((row) => ({
        job: row.jobPost,
        boostType: row.type,
        deliveryToken: this.delivery.sign({
          boostId: row.id,
          placement: query.placement,
          issuedAt: now.getTime(),
        }),
      }));
  }

  async recordImpression(deliveryToken: string, visitorKeyOrIp: string) {
    return this.recordEvent(deliveryToken, visitorKeyOrIp, JobBoostEventType.IMPRESSION);
  }

  async recordClick(deliveryToken: string, visitorKeyOrIp: string) {
    return this.recordEvent(deliveryToken, visitorKeyOrIp, JobBoostEventType.CLICK);
  }

  private async recordEvent(
    deliveryToken: string,
    visitorKeyOrIp: string,
    eventType: JobBoostEventType,
  ) {
    const payload = this.delivery.verify(deliveryToken);
    if (!payload) {
      // Token hết hạn/giả mạo: coi như no-op thành công, không lộ lý do cho
      // client -- một dashboard số liệu sai lệch không đáng để trả lỗi khiến
      // trang public bị ảnh hưởng UX vì một request tracking nền.
      this.logger.debug('Ignored delivery event with invalid/expired token');
      return { recorded: false as const };
    }

    const visitorHash = this.delivery.hashVisitor(visitorKeyOrIp);
    const eventDate = new Date(new Date().toISOString().slice(0, 10));

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.jobBoostDeliveryEvent.create({
          data: {
            jobBoostId: payload.boostId,
            placement: payload.placement,
            eventType,
            visitorHash,
            eventDate,
          },
        });

        const metricField = eventType === JobBoostEventType.IMPRESSION ? 'impressions' : 'clicks';
        await tx.jobBoostMetric.upsert({
          where: { jobBoostId_date: { jobBoostId: payload.boostId, date: eventDate } },
          create: {
            jobBoostId: payload.boostId,
            jobPostId: await this.jobPostIdFor(tx, payload.boostId),
            date: eventDate,
            [metricField]: 1,
          },
          update: { [metricField]: { increment: 1 } },
        });

        if (eventType === JobBoostEventType.IMPRESSION) {
          await tx.jobBoost.updateMany({
            where: { id: payload.boostId, firstImpressionAt: null },
            data: { firstImpressionAt: new Date() },
          });
          await tx.jobBoost.update({
            where: { id: payload.boostId },
            data: { lastImpressionAt: new Date() },
          });
        }
      });
      return { recorded: true as const };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Trùng (boost, placement, loại sự kiện, visitor, ngày) -- visitor đã
        // được tính hôm nay, đây là dedupe hoạt động đúng, không phải lỗi.
        return { recorded: false as const };
      }
      throw error;
    }
  }

  private async jobPostIdFor(tx: Prisma.TransactionClient, boostId: string): Promise<string> {
    const boost = await tx.jobBoost.findUniqueOrThrow({
      where: { id: boostId },
      select: { jobPostId: true },
    });
    return boost.jobPostId;
  }
}
