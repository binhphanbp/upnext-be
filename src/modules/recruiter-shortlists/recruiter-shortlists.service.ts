import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShortlistStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateShortlistDto } from './dto/create-shortlist.dto';
import { ListShortlistQueryDto } from './dto/list-shortlist-query.dto';
import { UpdateShortlistDto } from './dto/update-shortlist.dto';

/**
 * What a pool row needs to render, and nothing more.
 *
 * The raw `candidateProfile` carries phone number, gender, birthdate and address; those are
 * contact details a recruiter reaches through the messaging flow, not fields a list screen
 * should hand out in bulk.
 */
const SHORTLIST_SELECT = {
  id: true,
  priority: true,
  status: true,
  note: true,
  createdAt: true,
  jobPost: { select: { id: true, title: true } },
  // "Who saved this candidate" — the display name is on the profile, not the account.
  recruiterAccount: {
    select: { id: true, email: true, profile: { select: { fullName: true } } },
  },
  candidateProfile: {
    select: {
      id: true,
      description: true,
      preferredSearchCity: true,
      jobSearchStatus: true,
      account: { select: { id: true, fullName: true, email: true } },
      // Scheduling an interview needs a CV version to attach, so the UI has to know
      // up-front whether this candidate can be scheduled at all.
      cvs: {
        where: { status: 'ACTIVE' },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        take: 1,
        select: { id: true, title: true },
      },
    },
  },
} satisfies Prisma.RecruiterCandidateShortlistSelect;

@Injectable()
export class RecruiterShortlistsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('Tài khoản của bạn chưa thuộc công ty nào.');
    }
    return user.companyId;
  }

  async addToShortlist(user: AuthenticatedUser, dto: CreateShortlistDto) {
    const companyId = this.requireCompany(user);

    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { id: dto.candidateProfileId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy hồ sơ ứng viên.');

    if (dto.jobPostId) {
      // The tag is shown to the whole team, so it must point at one of their own postings.
      const jobPost = await this.prisma.jobPost.findFirst({
        where: { id: dto.jobPostId, companyId },
        select: { id: true },
      });
      if (!jobPost) throw new NotFoundException('Không tìm thấy tin tuyển dụng của công ty bạn.');
    }

    try {
      return await this.prisma.recruiterCandidateShortlist.create({
        data: {
          companyId,
          recruiterAccountId: user.id,
          candidateProfileId: dto.candidateProfileId,
          jobPostId: dto.jobPostId ?? null,
          priority: dto.priority ?? 0,
          note: dto.note ?? null,
        },
        select: SHORTLIST_SELECT,
      });
    } catch (error) {
      // Two recruiters can press Save at the same moment; the unique index is what
      // actually decides, so the race is reported rather than pre-checked.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ứng viên này đã có trong danh sách của công ty bạn.');
      }
      throw error;
    }
  }

  async listShortlist(user: AuthenticatedUser, query: ListShortlistQueryDto) {
    const companyId = this.requireCompany(user);

    const where: Prisma.RecruiterCandidateShortlistWhereInput = {
      companyId,
      status: query.status ?? ShortlistStatus.ACTIVE,
      ...(query.mine ? { recruiterAccountId: user.id } : {}),
      ...(query.jobPostId ? { jobPostId: query.jobPostId } : {}),
      ...(query.q
        ? {
            candidateProfile: {
              account: { fullName: { contains: query.q, mode: 'insensitive' } },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.recruiterCandidateShortlist.findMany({
        where,
        select: SHORTLIST_SELECT,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        ...toPagination(query),
      }),
      this.prisma.recruiterCandidateShortlist.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const { candidateProfile, ...rest } = item;
        const { cvs, ...profile } = candidateProfile;
        return {
          ...rest,
          candidateProfile: profile,
          /** Null means the candidate has no CV, so they cannot be scheduled yet. */
          latestCv: cvs[0] ?? null,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Notes, priority and archiving — every member of the company may edit the shared row. */
  async updateShortlist(shortlistId: string, user: AuthenticatedUser, dto: UpdateShortlistDto) {
    const companyId = this.requireCompany(user);
    await this.findOwnedRow(shortlistId, companyId);

    return this.prisma.recruiterCandidateShortlist.update({
      where: { id: shortlistId },
      data: {
        ...(dto.priority === undefined ? {} : { priority: dto.priority }),
        ...(dto.note === undefined ? {} : { note: dto.note }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
      select: SHORTLIST_SELECT,
    });
  }

  async removeFromShortlist(shortlistId: string, user: AuthenticatedUser) {
    const companyId = this.requireCompany(user);
    await this.findOwnedRow(shortlistId, companyId);

    await this.prisma.recruiterCandidateShortlist.delete({ where: { id: shortlistId } });
  }

  private async findOwnedRow(shortlistId: string, companyId: string) {
    const row = await this.prisma.recruiterCandidateShortlist.findUnique({
      where: { id: shortlistId },
      select: { id: true, companyId: true },
    });

    // A row from another company is reported as missing rather than forbidden, so the
    // endpoint cannot be used to probe which candidates a competitor has saved.
    if (!row || row.companyId !== companyId) {
      throw new NotFoundException('Không tìm thấy ứng viên trong danh sách.');
    }

    return row;
  }
}
