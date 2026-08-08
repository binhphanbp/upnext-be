import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyReviewsService } from './company-reviews.service';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { CreateCompanyReviewReportDto } from './dto/create-company-review-report.dto';
import { ListMyCompanyReviewsQueryDto } from './dto/list-my-company-reviews-query.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';

// ─── POST & GET reviews scoped under /companies/:id ──────────────────────────
@ApiTags('Company - Reviews')
@Controller('companies')
export class CompanyReviewsController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  @ApiOperation({ summary: 'Tạo đánh giá công ty' })
  @ApiParam({ name: 'id', description: 'Company UUID or Slug' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @Post(':id/reviews')
  createReview(
    @Param('id') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyReviewDto,
  ) {
    return this.companyReviewsService.createReview(user.id, companyId, dto);
  }

  @ApiOperation({ summary: 'Đánh giá của tôi cho công ty này (nếu có)' })
  @ApiParam({ name: 'id', description: 'Company UUID or Slug' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @Get(':id/reviews/me')
  getMyReview(
    @Param('id') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyReviewsService.getMyReview(user.id, companyId);
  }

  @ApiOperation({ summary: 'Danh sách đánh giá công ty' })
  @ApiParam({ name: 'id', description: 'Company UUID or Slug' })
  @Get(':id/reviews')
  listReviews(@Param('id') companyId: string) {
    return this.companyReviewsService.listReviews(companyId);
  }
}

// ─── PATCH, DELETE & report scoped under /company-reviews ────────────────────
@ApiTags('Company - Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-reviews')
export class CompanyReviewsMutationController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  // Declared before the ':id' routes so the literal path is not shadowed by them.
  @ApiOperation({ summary: 'Danh sách đánh giá về công ty của tôi (dành cho Recruiter)' })
  @Roles(ActorType.RECRUITER)
  @Get('my-company')
  listMyCompanyReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMyCompanyReviewsQueryDto,
  ) {
    return this.companyReviewsService.listMyCompanyReviews(user, query);
  }

  @ApiOperation({ summary: 'Cập nhật đánh giá công ty' })
  @ApiParam({ name: 'id', description: 'Company review UUID' })
  @Roles(ActorType.CANDIDATE)
  @Patch(':id')
  updateReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyReviewDto,
  ) {
    return this.companyReviewsService.updateReview(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Xóa đánh giá công ty' })
  @ApiParam({ name: 'id', description: 'Company review UUID' })
  @Roles(ActorType.CANDIDATE)
  @Delete(':id')
  @HttpCode(204)
  async deleteReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.companyReviewsService.deleteReview(id, user.id);
  }

  @ApiOperation({ summary: 'Báo cáo đánh giá công ty (chỉ công ty được đánh giá)' })
  @ApiParam({ name: 'id', description: 'Company review UUID' })
  @Roles(ActorType.RECRUITER)
  @Post(':id/report')
  reportReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyReviewReportDto,
  ) {
    return this.companyReviewsService.reportReview(id, user, dto);
  }
}
