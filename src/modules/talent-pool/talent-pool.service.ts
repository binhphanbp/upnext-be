import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FilePurpose, JobSearchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildLegacyContactEligibilityWhere } from '../candidate-profile/candidate-eligibility';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { EmailService } from '../../common/email/email.service';
import { SearchTalentPoolDto } from './dto/search-talent-pool.dto';

/**
 * Kho CV v2: duyệt miễn phí, xem chi tiết theo quota tháng, che PII cho tới
 * khi công ty mua gói.
 *
 * ## Vì sao KHÔNG còn `unlock()`
 *
 * Bản trước bán vĩnh viễn thông tin liên hệ qua `CvPoolUnlock` (một lần mở,
 * xem lại mãi mãi). Route đó đã bị khai tử (`talent-pool.controller.ts` trả
 * 410). Thiết kế mới thay hẳn bằng: xem CHI TIẾT (không phải chỉ liên hệ) theo
 * hạn mức **tháng** (`CvPoolDetailView`, xem lại trong cùng kỳ không trừ thêm),
 * và mức độ che phụ thuộc một cờ gói riêng (`CV_POOL_UNLOCKED_PROFILE`) chứ
 * không phải bản thân việc đã xem hay chưa.
 *
 * ## Hai trục độc lập, đọc kỹ trước khi sửa
 *
 * 1. **Bao nhiêu lượt xem chi tiết/tháng** -- `CV_POOL_VIEW`, `METERED`,
 *    `consume()` mỗi lần xem một hồ sơ LẦN ĐẦU trong kỳ.
 * 2. **Xem thấy gì** -- `CV_POOL_UNLOCKED_PROFILE`, `CONCURRENT`, chỉ đọc qua
 *    `getFeatureLimit()`, không bao giờ `consume()`. Free CHỈ che số điện
 *    thoại + email và không cho tải CV gốc; mọi trường khác (tên, địa chỉ,
 *    ngày sinh, giới tính, link cá nhân, kỹ năng, kinh nghiệm...) hiện đầy đủ
 *    ngay cả khi chưa mua gói. Pro bỏ che luôn hai kênh liên hệ đó + cho tải
 *    CV gốc.
 *
 * Phạm vi che hẹp hơn bản thiết kế đầu (từng che cả tên/địa chỉ) -- điều chỉnh
 * theo đúng sản phẩm tham chiếu: thứ đổi tiền là HAI KÊNH LIÊN HỆ TRỰC TIẾP,
 * không phải toàn bộ danh tính. Gộp hai trục thành một con số sẽ buộc mọi lần
 * đổi hạn mức xem phải kèm đổi mức độ che, và ngược lại -- hai quyết định sản
 * phẩm độc lập không nên khoá vào nhau.
 */
@Injectable()
export class TalentPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: SubscriptionQuotaService,
    private readonly email: EmailService,
  ) {}

  async sendApplicationInvitation(companyId: string, candidateProfileId: string, message?: string) {
    const existingInvitation = await this.prisma.talentPoolInvitation.findUnique({
      where: {
        companyId_candidateProfileId: { companyId, candidateProfileId },
      },
    });
    if (existingInvitation) {
      throw new ConflictException('Bạn đã gửi lời mời ứng tuyển cho ứng viên này rồi.');
    }

    const [company, candidate] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, applicationInvitationTemplate: true },
      }),
      this.prisma.candidateProfile.findFirst({
        where: {
          id: candidateProfileId,
          ...buildLegacyContactEligibilityWhere({ companyId }),
          OR: [
            { talentDiscoveryPreference: null },
            { talentDiscoveryPreference: { is: { allowInvitations: true } } },
          ],
        },
        select: { account: { select: { fullName: true, email: true } } },
      }),
    ]);

    if (!company) throw new NotFoundException('Công ty không tồn tại.');
    if (!candidate) {
      throw new ForbiddenException(
        'Ứng viên không cho phép nhận lời mời ứng tuyển hoặc không còn hiển thị.',
      );
    }

    const template =
      message?.trim() ||
      company.applicationInvitationTemplate?.trim() ||
      'Chào {candidateName},\n\n{companyName} đã xem hồ sơ của bạn trên UpNext và trân trọng mời bạn ứng tuyển.';
    const html = formatInvitationHtml(template, company.name, candidate.account.fullName);
    const text = stripHtml(
      template
        .replaceAll('{candidateName}', candidate.account.fullName)
        .replaceAll('{companyName}', company.name),
    );

    await this.email.sendApplicationInvitation({
      to: candidate.account.email,
      candidateName: candidate.account.fullName,
      companyName: company.name,
      html,
      text,
    });

    await this.prisma.talentPoolInvitation.create({
      data: {
        companyId,
        candidateProfileId,
        message: message?.trim() || null,
      },
    });

    return { sent: true };
  }

  /**
   * Trạng thái quyền lợi cho frontend -- không mirror `NEXT_PUBLIC_*`, cùng lý
   * do đã ghim ở `DiscoveryCapabilitiesService`: cờ tính năng là dữ liệu, một
   * bundle cũ không tự biết backend vừa đổi gói.
   */
  async getCapabilities(companyId: string) {
    const snapshots = await this.quota.peek(companyId);
    const view = snapshots.find((row) => row.feature === SubscriptionFeature.CV_POOL_VIEW);
    const unlocked = snapshots.find(
      (row) => row.feature === SubscriptionFeature.CV_POOL_UNLOCKED_PROFILE,
    );
    const aiSearch = snapshots.find((row) => row.feature === SubscriptionFeature.CV_POOL_AI_SEARCH);

    return {
      view: {
        limit: view?.limit ?? null,
        used: view?.used ?? 0,
        remaining: view?.remaining ?? null,
        periodEnd: view?.periodEnd ?? null,
      },
      // Cùng quy tắc `limit > 0 || null` với `isProfileUnlocked()` -- không chỉ
      // dựa vào `enabled`.
      unlocked:
        Boolean(unlocked?.enabled) && (unlocked?.limit === null || (unlocked?.limit ?? 0) > 0),
      aiSearch: {
        enabled:
          Boolean(aiSearch?.enabled) && (aiSearch?.limit === null || (aiSearch?.limit ?? 0) > 0),
        limit: aiSearch?.limit ?? null,
        used: aiSearch?.used ?? 0,
        remaining: aiSearch?.remaining ?? null,
        periodEnd: aiSearch?.periodEnd ?? null,
      },
    };
  }

  /**
   * Danh sách rút gọn: không có `fullName`/`email`. Duyệt danh sách MIỄN PHÍ
   * cho mọi công ty, kể cả chưa mua gói -- không còn gate `assertFeatureEnabled`
   * như bản cũ (bản cũ khoá cả danh sách sau `CV_POOL_VIEW`, nên Free tier với
   * `limitValue: 0` không vào được Kho CV; giờ chỉ XEM CHI TIẾT mới trừ).
   */
  async search(companyId: string, dto: SearchTalentPoolDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = {
      ...buildLegacyContactEligibilityWhere({ companyId }),
      ...(dto.city
        ? { preferredSearchCity: { contains: dto.city, mode: 'insensitive' as const } }
        : {}),
      ...(dto.skillIds?.length ? { skills: { some: { skillId: { in: dto.skillIds } } } } : {}),
    };

    const [items, total, periodStart, unlocked] = await Promise.all([
      this.prisma.candidateProfile.findMany({
        where,
        select: {
          id: true,
          description: true,
          preferredSearchCity: true,
          updatedAt: true,
          jobSearchStatus: true,
          account: { select: { fullName: true } },
          skills: {
            select: {
              skill: { select: { id: true, name: true } },
              yearsOfExperience: true,
            },
            take: 10,
          },
          experiences: {
            select: {
              positionTitle: true,
              companyName: true,
              isCurrent: true,
              startDate: true,
              endDate: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
          },
          jobPreference: {
            select: {
              desiredSalaryMin: true,
              desiredSalaryMax: true,
              salaryCurrency: true,
            },
          },
          cvs: {
            where: { isDefault: true },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.candidateProfile.count({ where }),
      // Cần để đánh dấu "đã xem" mà không phải trả tiền lần nữa -- đọc chu kỳ
      // TRƯỚC khi biết danh sách để một truy vấn duy nhất tra được cả lô, thay
      // vì N truy vấn "đã xem chưa" cho N ứng viên trên trang.
      this.quota
        .resolveCurrentPeriod(companyId, SubscriptionFeature.CV_POOL_VIEW)
        .then((window) => window.periodStart),
      this.isProfileUnlocked(companyId),
    ]);

    const [viewedIds, avatarFiles, invitedIds] = await Promise.all([
      items.length
        ? this.prisma.cvPoolDetailView
            .findMany({
              where: {
                companyId,
                periodStart,
                candidateProfileId: { in: items.map((row) => row.id) },
              },
              select: { candidateProfileId: true },
            })
            .then((rows) => new Set(rows.map((row) => row.candidateProfileId)))
        : Promise.resolve(new Set<string>()),
      items.length
        ? this.prisma.fileAsset.findMany({
            where: {
              ownerType: 'candidate_profile',
              ownerId: { in: items.map((row) => row.id) },
              purpose: FilePurpose.AVATAR,
            },
            select: { ownerId: true, publicUrl: true },
          })
        : Promise.resolve([]),
      items.length
        ? this.prisma.talentPoolInvitation
            .findMany({
              where: {
                companyId,
                candidateProfileId: { in: items.map((row) => row.id) },
              },
              select: { candidateProfileId: true },
            })
            .then((rows) => new Set(rows.map((row) => row.candidateProfileId)))
        : Promise.resolve(new Set<string>()),
    ]);

    const avatarMap = new Map(
      avatarFiles
        .filter((r): r is { ownerId: string; publicUrl: string } =>
          Boolean(r.ownerId && r.publicUrl),
        )
        .map((r) => [r.ownerId, r.publicUrl]),
    );

    return {
      data: items.map((profile) => ({
        candidateProfileId: profile.id,
        fullName: profile.account.fullName,
        avatarUrl: avatarMap.get(profile.id) ?? `https://i.pravatar.cc/150?u=${profile.id}`,
        headline: profile.experiences[0]?.positionTitle ?? null,
        currentCompany: unlocked
          ? (profile.experiences[0]?.companyName ?? null)
          : profile.experiences[0]?.companyName
            ? null
            : null,
        description: profile.description,
        city: profile.preferredSearchCity,
        skills: profile.skills.map((row) => row.skill),
        viewedThisPeriod: viewedIds.has(profile.id),
        hasInvited: invitedIds.has(profile.id),
        updatedAt: profile.updatedAt.toISOString(),
        experienceYears: computeExperienceYears(profile.experiences, profile.skills),
        expectedSalary: formatExpectedSalary(profile.jobPreference),
        hasCv: profile.cvs.length > 0,
        unlocked,
        isOpenToWork: profile.jobSearchStatus === JobSearchStatus.OPEN_TO_WORK,
      })),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Xem chi tiết một hồ sơ.
   *
   * Xem lại hồ sơ ĐÃ xem trong CÙNG kỳ không tốn thêm lượt -- kiểm
   * `CvPoolDetailView` trước khi `consume()`, không phải sau, đúng nguyên tắc
   * đã có ở `unlock()` bản cũ. Khác biệt duy nhất: khoá theo kỳ, không phải
   * vĩnh viễn.
   */
  async viewDetail(companyId: string, recruiterId: string, candidateProfileId: string) {
    const candidate = await this.prisma.candidateProfile.findFirst({
      where: { id: candidateProfileId, ...buildLegacyContactEligibilityWhere({ companyId }) },
      select: { id: true },
    });
    if (!candidate) {
      throw new NotFoundException('Hồ sơ không tồn tại hoặc chưa mở tìm kiếm.');
    }

    const { periodStart } = await this.quota.resolveCurrentPeriod(
      companyId,
      SubscriptionFeature.CV_POOL_VIEW,
    );

    const alreadyViewed = await this.prisma.cvPoolDetailView.findUnique({
      where: {
        companyId_candidateProfileId_periodStart: { companyId, candidateProfileId, periodStart },
      },
    });

    if (!alreadyViewed) {
      const idempotencyKey = `cv-pool-view:${companyId}:${candidateProfileId}:${periodStart.getTime()}`;

      await this.prisma.$transaction(async (tx) => {
        // Không rẽ nhánh theo `replayed`: một crash giữa lúc tiêu quota và lúc
        // ghi `CvPoolDetailView` không được để hồ sơ không bao giờ được đánh
        // dấu đã xem dù quota đã mất -- cùng lý lẽ với `unlock()` bản cũ.
        await this.quota.consume(tx, {
          companyId,
          feature: SubscriptionFeature.CV_POOL_VIEW,
          referenceType: 'CV_POOL_DETAIL_VIEW',
          referenceId: randomUUID(),
          idempotencyKey,
        });

        try {
          await tx.cvPoolDetailView.create({
            data: { companyId, candidateProfileId, viewedByRecruiterId: recruiterId, periodStart },
          });
        } catch (error) {
          // Đua giữa hai request cùng mở một hồ sơ trong cùng kỳ: unique
          // constraint chặn bản ghi thứ hai. Quota vẫn tiêu đúng một lần vì
          // `idempotencyKey` cố định theo (company, candidate, kỳ).
          if (!isUniqueViolation(error)) throw error;
        }
      });
    }

    const unlocked = await this.isProfileUnlocked(companyId);
    const profile = await this.loadProfileDetail(candidateProfileId);
    const [avatarFile, cvFile, existingInvitation] = await Promise.all([
      this.prisma.fileAsset.findFirst({
        where: {
          ownerType: 'candidate_profile',
          ownerId: profile.id,
          purpose: FilePurpose.AVATAR,
        },
        select: { publicUrl: true },
      }),
      this.loadCvSourceFile(candidateProfileId),
      this.prisma.talentPoolInvitation.findUnique({
        where: {
          companyId_candidateProfileId: { companyId, candidateProfileId },
        },
        select: { sentAt: true },
      }),
    ]);

    return {
      data: this.buildDetailDto(
        profile,
        unlocked,
        avatarFile?.publicUrl ?? null,
        cvFile && cvFile.publicUrl
          ? { publicUrl: cvFile.publicUrl, originalName: cvFile.originalName }
          : null,
        Boolean(existingInvitation),
        existingInvitation?.sentAt ? existingInvitation.sentAt.toISOString() : null,
      ),
    };
  }

  /**
   * Đường dẫn tải CV gốc -- chỉ công ty đã mua gói VÀ đã xem chi tiết hồ sơ
   * này trong kỳ hiện tại (không cho tải "tắt" -- phải qua `viewDetail()`
   * trước, đúng thứ tự trải nghiệm mà UI trình bày).
   *
   * Trả thẳng `publicUrl` hiện có của `FileAsset` (cùng cơ chế phân phối file
   * mà phần còn lại của sản phẩm đang dùng) thay vì dựng một pipeline stream
   * riêng -- đó là một khoản đầu tư hạ tầng không nằm trong yêu cầu hiện tại,
   * và `FileAsset.publicUrl` không phải bí mật lâu dài (URL Cloudinary công
   * khai) nên chặn ở tầng entitlement này là hàng rào thật, không phải một ảo
   * giác an toàn.
   */
  async getCvDownload(companyId: string, candidateProfileId: string) {
    const unlocked = await this.isProfileUnlocked(companyId);
    if (!unlocked) {
      throw new ForbiddenException({
        code: 'CV_POOL_NOT_UNLOCKED',
        message: 'Công ty cần nâng gói để tải CV gốc.',
      });
    }

    const { periodStart } = await this.quota.resolveCurrentPeriod(
      companyId,
      SubscriptionFeature.CV_POOL_VIEW,
    );
    const viewed = await this.prisma.cvPoolDetailView.findUnique({
      where: {
        companyId_candidateProfileId_periodStart: { companyId, candidateProfileId, periodStart },
      },
    });
    if (!viewed) {
      throw new ForbiddenException({
        code: 'CV_POOL_NOT_VIEWED',
        message: 'Xem chi tiết hồ sơ trước khi tải CV.',
      });
    }

    const file = await this.loadCvSourceFile(candidateProfileId);
    if (!file) {
      throw new NotFoundException({
        code: 'CV_FILE_NOT_AVAILABLE',
        message: 'Ứng viên chưa có file CV gốc để tải (chỉ dùng CV Builder).',
      });
    }

    return { downloadUrl: file.publicUrl, originalName: file.originalName };
  }

  /**
   * Cờ "được xem không che PII + tải CV" -- KHÔNG dựa vào `enabled` một mình.
   *
   * Helper seed (`prisma/seed.ts`) luôn ghi `enabled: true` cho MỌI dòng trong
   * mảng nó upsert, kể cả dòng Free có `limitValue: 0` -- nên `enabled` không
   * đáng tin một mình để phân biệt free/paid. `limit > 0 hoặc null` (không
   * giới hạn) mới là tín hiệu thật, khớp với cách `assertFeatureEnabled` ở nơi
   * khác coi "trong plan nhưng limitValue <= 0" là tương đương chưa có quyền.
   */
  private async isProfileUnlocked(companyId: string): Promise<boolean> {
    const { enabled, limit } = await this.quota.getFeatureLimit(
      companyId,
      SubscriptionFeature.CV_POOL_UNLOCKED_PROFILE,
    );
    return enabled && (limit === null || limit > 0);
  }

  private async loadProfileDetail(candidateProfileId: string) {
    return this.prisma.candidateProfile.findUniqueOrThrow({
      where: { id: candidateProfileId },
      select: {
        id: true,
        phoneNumber: true,
        address: true,
        preferredSearchCity: true,
        description: true,
        birthdate: true,
        gender: true,
        jobSearchStatus: true,
        account: { select: { fullName: true, email: true } },
        links: { select: { type: true, url: true } },
        skills: {
          select: {
            proficiencyLevel: true,
            yearsOfExperience: true,
            skill: { select: { id: true, name: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        experiences: {
          select: {
            companyName: true,
            positionTitle: true,
            employmentType: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
            description: true,
            technologies: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
        },
        educations: {
          select: {
            schoolName: true,
            degree: true,
            major: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
        },
        projects: {
          select: { name: true, role: true, description: true, technologies: true },
          orderBy: { sortOrder: 'asc' },
        },
        certifications: {
          select: { name: true, organization: true, issuedDate: true },
          orderBy: { sortOrder: 'asc' },
        },
        languages: { select: { language: true, proficiency: true } },
        jobPreference: {
          select: {
            desiredPosition: true,
            workingModel: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            salaryCurrency: true,
            desiredLevel: { select: { name: true } },
          },
        },
      },
    });
  }

  private buildDetailDto(
    profile: ProfileDetailRow,
    unlocked: boolean,
    avatarUrl: string | null,
    cvFile: { publicUrl: string; originalName: string } | null,
    hasInvited: boolean = false,
    invitedAt: string | null = null,
  ) {
    // Object literal, không `...spread` -- cùng lý do đã ghim ở
    // `dto/discovery-recommendation.dto.ts`: một cột PII mới thêm vào
    // `CandidateProfile` sau này không được tự động lọt ra đây.
    //
    // CHỈ che `phoneNumber` + `email` khi chưa unlock -- KHÔNG che
    // `fullName`/`address`/`links`/`birthdate`/`gender`. Đây là điều chỉnh so
    // với bản đầu (từng che cả 5 trường): sản phẩm tham chiếu cho thấy tên,
    // địa chỉ, ngày sinh, giới tính hiện ngay cả khi chưa mua gói -- chỉ HAI
    // KÊNH LIÊN HỆ trực tiếp (điện thoại, email) mới là thứ đổi tiền để xem.
    return {
      candidateProfileId: profile.id,
      fullName: profile.account.fullName,
      avatarUrl: avatarUrl ?? `https://i.pravatar.cc/150?u=${profile.id}`,
      gender: profile.gender,
      email: unlocked ? profile.account.email : null,
      phoneNumber: unlocked ? profile.phoneNumber : null,
      address: profile.address,
      city: profile.preferredSearchCity,
      birthdate: profile.birthdate,
      links: profile.links,
      description: profile.description,
      skills: profile.skills.map((row) => ({
        id: row.skill.id,
        name: row.skill.name,
        proficiencyLevel: row.proficiencyLevel,
        yearsOfExperience: row.yearsOfExperience,
      })),
      experiences: profile.experiences,
      educations: profile.educations,
      projects: profile.projects,
      certifications: profile.certifications,
      languages: profile.languages,
      jobPreference: profile.jobPreference,
      unlocked,
      isOpenToWork: profile.jobSearchStatus === JobSearchStatus.OPEN_TO_WORK,
      cvFile,
      hasInvited,
      invitedAt,
    };
  }

  private async loadCvSourceFile(candidateProfileId: string) {
    const defaultCv = await this.prisma.cV.findFirst({
      where: { candidateProfileId, isDefault: true },
      select: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            sourceFile: { select: { publicUrl: true, originalName: true, mimeType: true } },
          },
        },
      },
    });

    const file = defaultCv?.versions[0]?.sourceFile;
    if (!file?.publicUrl) return null;
    return file;
  }
}

type ProfileDetailRow = Awaited<ReturnType<TalentPoolService['loadProfileDetail']>>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatInvitationHtml(
  rawContent: string,
  companyName: string,
  candidateName: string,
): string {
  const content = rawContent
    .replaceAll('{candidateName}', candidateName)
    .replaceAll('{companyName}', companyName);

  let bodyHtml: string;
  if (/<(p|br|div|table|ul|li)\b[^>]*>/i.test(content)) {
    bodyHtml = content;
  } else {
    const escaped = escapeHtml(content);
    const linkified = escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" style="color: #059669; font-weight: 600; text-decoration: underline; word-break: break-all;">$1</a>',
    );
    bodyHtml = linkified
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(
        (p) =>
          `<p style="margin: 0 0 16px 0; line-height: 1.7; color: #334155; font-size: 14.5px;">${p.replace(/\n/g, '<br/>')}</p>`,
      )
      .join('\n');
  }

  const today = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thư mời ứng tuyển</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #334155;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
    <div style="height: 5px; background: linear-gradient(90deg, #10b981 0%, #059669 100%);"></div>
    <div style="padding: 28px 28px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="text-align: left; vertical-align: middle;">
            <span style="font-size: 20px; font-weight: 800; color: #059669; letter-spacing: -0.5px;">UpNext</span>
          </td>
          <td style="text-align: right; vertical-align: middle; font-size: 13px; color: #94a3b8; font-weight: 500;">
            ${today}
          </td>
        </tr>
      </table>

      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
        <div style="font-size: 16px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
          📩 Thư Mời Ứng Tuyển
        </div>
        <div style="font-size: 13.5px; color: #047857;">
          Công ty <strong>${escapeHtml(companyName)}</strong> trân trọng gửi lời mời ứng tuyển đến bạn.
        </div>
      </div>

      <div style="font-size: 14.5px; line-height: 1.7; color: #334155;">
        ${bodyHtml}
      </div>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        Email này được gửi qua Nền tảng Tuyển dụng <strong>UpNext</strong> theo thông tin hồ sơ của bạn.<br/>
        © ${new Date().getFullYear()} UpNext Works. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function computeExperienceYears(
  experiences: Array<{ startDate: Date | null; endDate: Date | null; isCurrent: boolean }>,
  skills: Array<{ yearsOfExperience: unknown }>,
): number {
  let totalMonths = 0;
  for (const exp of experiences) {
    if (!exp.startDate) continue;
    const start = new Date(exp.startDate).getTime();
    const end = exp.endDate ? new Date(exp.endDate).getTime() : Date.now();
    const months = Math.max(1, Math.round((end - start) / (30.44 * 24 * 3600 * 1000)));
    totalMonths += months;
  }
  if (totalMonths > 0) {
    return Math.max(1, Math.round(totalMonths / 12));
  }
  for (const sk of skills) {
    const y = Number(sk.yearsOfExperience);
    if (Number.isFinite(y) && y > 0) return Math.round(y);
  }
  return 1;
}

export function formatExpectedSalary(
  pref: { desiredSalaryMin: unknown; desiredSalaryMax: unknown; salaryCurrency: string } | null,
): string {
  if (!pref) return 'Thoả thuận';
  const min = pref.desiredSalaryMin ? Number(pref.desiredSalaryMin) : null;
  const max = pref.desiredSalaryMax ? Number(pref.desiredSalaryMax) : null;
  const currency = pref.salaryCurrency || 'VND';
  if (min && max) {
    if (currency === 'USD') return `$${min} - $${max}`;
    return `${Math.round(min / 1_000_000)} - ${Math.round(max / 1_000_000)} triệu`;
  }
  if (min) {
    if (currency === 'USD') return `$${min}`;
    return `${Math.round(min / 1_000_000)} triệu`;
  }
  return 'Thoả thuận';
}
