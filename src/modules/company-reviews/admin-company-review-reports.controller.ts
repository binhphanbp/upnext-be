import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyReviewsService } from './company-reviews.service';
import { ListCompanyReviewReportsQueryDto } from './dto/list-company-review-reports-query.dto';

@ApiTags('Admin - Company Review Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/company-review-reports')
export class AdminCompanyReviewReportsController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách báo cáo đánh giá công ty' })
  @ApiOkResponse({ description: 'Lấy danh sách báo cáo thành công.' })
  findAll(@Query() query: ListCompanyReviewReportsQueryDto) {
    return this.companyReviewsService.listReviewReports(query);
  }

  @Patch(':id/hide-review')
  @ApiOperation({ summary: 'Ẩn đánh giá bị báo cáo' })
  @ApiOkResponse({ description: 'Đã ẩn đánh giá và đóng báo cáo.' })
  hideReview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.companyReviewsService.hideReportedReview(id, user.id);
  }

  @Patch(':id/dismiss')
  @ApiOperation({ summary: 'Bỏ qua báo cáo (đánh giá vẫn hiển thị)' })
  @ApiOkResponse({ description: 'Đã bỏ qua báo cáo.' })
  dismiss(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.companyReviewsService.dismissReviewReport(id, user.id);
  }
}
