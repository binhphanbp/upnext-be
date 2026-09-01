import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SponsoredJobsService } from './sponsored-jobs.service';
import { SponsoredJobsQueryDto } from './dto/sponsored-jobs-query.dto';
import { RecordBoostDeliveryDto } from './dto/record-boost-delivery.dto';

/**
 * Public, không đăng nhập -- khu "Được tài trợ" trên `/jobs` và trang chủ
 * (mục 5 kế hoạch nghiệp vụ). Tách route khỏi `JobPostsController.findAll`
 * có chủ đích: không chèn/sắp xếp lại danh sách organic (mục 5.2 cho phép
 * dùng section riêng khi chưa có phân trang server-side an toàn).
 */
@ApiTags('Job - Sponsored')
@Controller('public')
export class SponsoredJobsController {
  constructor(private readonly sponsoredJobsService: SponsoredJobsService) {}

  @ApiOperation({
    summary: 'Danh sách tin được tài trợ cho một vị trí hiển thị',
    description: 'Tối đa 2 tin, xoay vòng công bằng theo lượt phục vụ gần nhất.',
  })
  @ApiOkResponse({ description: 'Danh sách tin tài trợ kèm token phân phối.' })
  @Get('sponsored-jobs')
  getSponsoredJobs(@Query() query: SponsoredJobsQueryDto) {
    return this.sponsoredJobsService.getSponsoredJobs(query);
  }

  @ApiOperation({ summary: 'Ghi nhận một impression cho thẻ tài trợ' })
  @ApiOkResponse({ description: 'Đã ghi nhận (hoặc bỏ qua nếu trùng/token không hợp lệ).' })
  @HttpCode(200)
  @Post('job-boost-deliveries/impression')
  recordImpression(
    @Body() dto: RecordBoostDeliveryDto,
    @Req() req: Request,
    @Headers('x-upnext-visitor-key') visitorKey?: string,
  ) {
    return this.sponsoredJobsService.recordImpression(
      dto.deliveryToken,
      visitorKey ?? req.ip ?? '',
    );
  }

  @ApiOperation({ summary: 'Ghi nhận một click cho thẻ tài trợ' })
  @ApiOkResponse({ description: 'Đã ghi nhận (hoặc bỏ qua nếu trùng/token không hợp lệ).' })
  @HttpCode(200)
  @Post('job-boost-deliveries/click')
  recordClick(
    @Body() dto: RecordBoostDeliveryDto,
    @Req() req: Request,
    @Headers('x-upnext-visitor-key') visitorKey?: string,
  ) {
    return this.sponsoredJobsService.recordClick(dto.deliveryToken, visitorKey ?? req.ip ?? '');
  }
}
