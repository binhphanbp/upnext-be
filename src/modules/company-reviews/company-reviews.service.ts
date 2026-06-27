import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';

@Injectable()
export class CompanyReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');
    return profile;
  }

  async createReview(candidateAccountId: string, companyId: string, dto: CreateCompanyReviewDto) {
    const profile = await this.getProfile(candidateAccountId);

    // Verify application belongs to candidate
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
    });

    if (!application || application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('Application does not belong to candidate');
    }

    if (application.jobPostId) {
      const job = await this.prisma.jobPost.findUnique({ where: { id: application.jobPostId } });
      if (job?.companyId !== companyId) {
        throw new ForbiddenException('Application is not for this company');
      }
    }

    const existing = await this.prisma.companyReview.findUnique({
      where: { applicationId: dto.applicationId },
    });

    if (existing) {
      throw new ConflictException('Review already exists for this application');
    }

    return this.prisma.companyReview.create({
      data: {
        ...dto,
        companyId,
      },
    });
  }

  async listReviews(companyId: string) {
    return this.prisma.companyReview.findMany({
      where: { companyId },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: true, // Only if permitted or limit fields
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReview(reviewId: string, candidateAccountId: string, dto: UpdateCompanyReviewDto) {
    const profile = await this.getProfile(candidateAccountId);

    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { application: true },
    });

    if (!review) throw new NotFoundException('Review not found');

    if (review.application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('Not authorized to update this review');
    }

    return this.prisma.companyReview.update({
      where: { id: reviewId },
      data: dto,
    });
  }

  async deleteReview(reviewId: string, candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);

    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { application: true },
    });

    if (!review) throw new NotFoundException('Review not found');

    if (review.application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('Not authorized to delete this review');
    }

    await this.prisma.companyReview.delete({
      where: { id: reviewId },
    });
  }
}
