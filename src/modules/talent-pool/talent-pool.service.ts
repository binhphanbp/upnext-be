import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CandidateContactPreferenceStatus,
  JobSearchStatus,
  ProfileVisibility,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { SearchTalentPoolDto } from './dto/search-talent-pool.dto';

/**
 * Ba lớp đồng ý giống nguyên `talent-contact.service.ts` -- kho CV không phát
 * minh cơ chế đồng ý thứ hai. Chỉ ứng viên thỏa cả ba mới xuất hiện ở đây.
 */
const VISIBLE_TO_RECRUITER_WHERE = {
  jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
  profileVisibility: ProfileVisibility.PUBLIC,
  contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
} as const;

@Injectable()
export class TalentPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  /**
   * Danh sách rút gọn: không có `fullName`/`email` (nằm ở `CandidateAccount`,
   * cố tình không include). Duyệt danh sách không tiêu quota -- chỉ
   * `unlock()` mới trừ, đúng nguyên tắc "browse trước, trả khi mở khóa".
   */
  async search(companyId: string, dto: SearchTalentPoolDto) {
    await this.quota.assertFeatureEnabled(companyId, SubscriptionFeature.CV_POOL_VIEW);

    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = {
      ...VISIBLE_TO_RECRUITER_WHERE,
      ...(dto.city ? { preferredSearchCity: { contains: dto.city, mode: 'insensitive' as const } } : {}),
      ...(dto.skillIds?.length ? { skills: { some: { skillId: { in: dto.skillIds } } } } : {}),
    };

    const [items, total, unlocks] = await Promise.all([
      this.prisma.candidateProfile.findMany({
        where,
        select: {
          id: true,
          description: true,
          preferredSearchCity: true,
          skills: { select: { skill: { select: { id: true, name: true } } }, take: 10 },
          experiences: {
            select: { positionTitle: true, companyName: true, isCurrent: true },
            orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.candidateProfile.count({ where }),
      this.prisma.cvPoolUnlock.findMany({
        where: { companyId },
        select: { candidateProfileId: true },
      }),
    ]);

    const unlockedIds = new Set(unlocks.map((row) => row.candidateProfileId));

    return {
      data: items.map((profile) => ({
        candidateProfileId: profile.id,
        headline: profile.experiences[0]?.positionTitle ?? null,
        currentCompany: profile.experiences[0]?.isCurrent
          ? profile.experiences[0].companyName
          : null,
        description: profile.description,
        city: profile.preferredSearchCity,
        skills: profile.skills.map((row) => row.skill),
        unlocked: unlockedIds.has(profile.id),
      })),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Mở khóa thông tin liên hệ đầy đủ của một hồ sơ. Đã mở trước đó thì trả lại
   * miễn phí -- kiểm `CvPoolUnlock` trước khi gọi `consume()`, không phải sau,
   * để một lần mở lại không tiêu thêm quota.
   */
  async unlock(companyId: string, recruiterId: string, candidateProfileId: string) {
    const existing = await this.prisma.cvPoolUnlock.findUnique({
      where: { companyId_candidateProfileId: { companyId, candidateProfileId } },
    });
    if (existing) return { data: await this.loadContact(candidateProfileId) };

    const candidate = await this.prisma.candidateProfile.findFirst({
      where: { id: candidateProfileId, ...VISIBLE_TO_RECRUITER_WHERE },
      select: { id: true },
    });
    if (!candidate) {
      throw new NotFoundException('Hồ sơ không tồn tại hoặc chưa mở tìm kiếm.');
    }

    const idempotencyKey = `cv-pool-unlock:${companyId}:${candidateProfileId}`;

    await this.prisma.$transaction(async (tx) => {
      // Không rẽ nhánh theo `replayed`: dù quota đã tiêu từ một lần gọi trước
      // (ví dụ crash giữa lúc tiêu quota và lúc tạo bản ghi dưới đây), vẫn phải
      // thử tạo `CvPoolUnlock` -- bỏ qua ở đây sẽ để candidate không bao giờ
      // được đánh dấu đã mở dù quota đã mất.
      await this.quota.consume(tx, {
        companyId,
        feature: SubscriptionFeature.CV_POOL_VIEW,
        referenceType: 'CV_POOL_UNLOCK',
        referenceId: randomUUID(),
        idempotencyKey,
      });

      try {
        await tx.cvPoolUnlock.create({
          data: { companyId, candidateProfileId, unlockedByRecruiterId: recruiterId },
        });
      } catch (error) {
        // Đua giữa hai request mở cùng một hồ sơ: unique constraint chặn bản
        // ghi thứ hai. Quota vẫn tiêu đúng một lần vì `idempotencyKey` cố định
        // theo (companyId, candidateProfileId), nên không cần hoàn -- chỉ cần
        // không tạo bản ghi trùng.
        if (!isUniqueViolation(error)) throw error;
      }
    });

    return { data: await this.loadContact(candidateProfileId) };
  }

  private async loadContact(candidateProfileId: string) {
    const profile = await this.prisma.candidateProfile.findUniqueOrThrow({
      where: { id: candidateProfileId },
      select: {
        id: true,
        phoneNumber: true,
        account: { select: { fullName: true, email: true } },
      },
    });
    return {
      candidateProfileId: profile.id,
      fullName: profile.account.fullName,
      email: profile.account.email,
      phoneNumber: profile.phoneNumber,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
