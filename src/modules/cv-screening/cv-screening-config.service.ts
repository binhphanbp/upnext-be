import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UpdateCvScreeningConfigDto } from './dto/update-cv-screening-config.dto';

export type CvScreeningConfigResponse = {
  customInstructions: string | null;
  defaultTopN: number | null;
  minSimilarityScore: number | null;
  updatedByAccountId: string | null;
  updatedAt: Date | null;
};

const EMPTY_CONFIG: CvScreeningConfigResponse = {
  customInstructions: null,
  defaultTopN: null,
  minSimilarityScore: null,
  updatedByAccountId: null,
  updatedAt: null,
};

@Injectable()
export class CvScreeningConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Readable by any team member -- the "AI lọc CV" screen pre-fills its
   * default Top-N from this for everyone, not just whoever can edit it. */
  async getConfig(recruiterId: string): Promise<CvScreeningConfigResponse> {
    const companyId = await this.resolveCompanyId(recruiterId);
    const config = await this.prisma.cvScreeningCompanyConfig.findUnique({
      where: { companyId },
    });

    if (!config) {
      return EMPTY_CONFIG;
    }

    return {
      customInstructions: config.customInstructions,
      defaultTopN: config.defaultTopN,
      minSimilarityScore: config.minSimilarityScore,
      updatedByAccountId: config.updatedByAccountId,
      updatedAt: config.updatedAt,
    };
  }

  /** Writable only by a recruiter with `company:manage` -- this changes AI
   * prompt behaviour and quota-billed shortlist size for the whole company,
   * not just the caller's own runs. */
  async updateConfig(
    user: AuthenticatedUser,
    dto: UpdateCvScreeningConfigDto,
  ): Promise<CvScreeningConfigResponse> {
    if (!user.permissions.includes('company:manage')) {
      throw new ForbiddenException(
        'Chỉ quản trị viên công ty mới có quyền chỉnh cấu hình AI lọc CV.',
      );
    }
    const companyId = await this.resolveCompanyId(user.id);

    const config = await this.prisma.cvScreeningCompanyConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        customInstructions: dto.customInstructions ?? null,
        defaultTopN: dto.defaultTopN ?? null,
        minSimilarityScore: dto.minSimilarityScore ?? null,
        updatedByAccountId: user.id,
      },
      update: {
        // Every field on this DTO is optional; only apply the ones the
        // caller actually sent so a partial PUT can't silently null out the
        // others.
        ...(dto.customInstructions !== undefined && {
          customInstructions: dto.customInstructions,
        }),
        ...(dto.defaultTopN !== undefined && { defaultTopN: dto.defaultTopN }),
        ...(dto.minSimilarityScore !== undefined && {
          minSimilarityScore: dto.minSimilarityScore,
        }),
        updatedByAccountId: user.id,
      },
    });

    return {
      customInstructions: config.customInstructions,
      defaultTopN: config.defaultTopN,
      minSimilarityScore: config.minSimilarityScore,
      updatedByAccountId: config.updatedByAccountId,
      updatedAt: config.updatedAt,
    };
  }

  private async resolveCompanyId(recruiterId: string): Promise<string> {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });

    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }
    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    return recruiter.companyId;
  }
}
