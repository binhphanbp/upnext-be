import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowWhenRestricted } from '../../common/decorators/allow-when-restricted.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { RecruiterAnalyticsQueryDto } from './dto/recruiter-analytics-query.dto';
import { RecruiterAnalyticsService } from './recruiter-analytics.service';

@ApiTags('Recruiter Analytics')
@Controller('recruiter/analytics')
export class RecruiterAnalyticsController {
  constructor(private readonly recruiterAnalyticsService: RecruiterAnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'Phân tích hiệu quả tuyển dụng cho các tin do recruiter hiện tại tạo',
    description:
      'Trả về KPI, funnel tuyển dụng (Xem → Ứng tuyển → Phỏng vấn → Offer → Hired), thời gian tuyển dụng trung bình/trung vị, ' +
      'chuỗi thời gian theo ngày, và bảng so sánh hiệu quả từng tin. Chỉ tính các tin do recruiter đang đăng nhập tạo.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @ApiQuery({ name: 'windowDays', required: false, enum: [7, 30, 90] })
  @ApiQuery({ name: 'jobPostId', required: false, description: 'UUID của tin tuyển dụng cần xem chi tiết' })
  @ApiOkResponse({ description: 'Dữ liệu phân tích tuyển dụng.' })
  getAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecruiterAnalyticsQueryDto,
  ) {
    return this.recruiterAnalyticsService.getAnalytics(user.id, query);
  }
}
