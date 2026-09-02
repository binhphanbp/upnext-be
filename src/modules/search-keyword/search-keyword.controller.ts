import { Body, Controller, Get, Ip, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import type { Request } from 'express';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KeywordAnalyticsQueryDto, KeywordTrendQueryDto } from './dto/keyword-analytics-query.dto';
import { KeywordAnalyticsService } from './keyword-analytics.service';
import { LogSearchKeywordDto } from './dto/log-search-keyword.dto';
import { GetPopularKeywordsDto } from './dto/get-popular-keywords.dto';
import { GetTopSearchKeywordsDto } from './dto/get-top-search-keywords.dto';
import { SearchKeywordService } from './search-keyword.service';

@ApiTags('Search - Keywords')
@Controller('search-keywords')
export class SearchKeywordController {
  constructor(
    private readonly searchKeywordService: SearchKeywordService,
    private readonly keywordAnalyticsService: KeywordAnalyticsService,
  ) {}

  @ApiOperation({ summary: 'Lưu lại từ khóa người dùng tìm kiếm' })
  @Post('log')
  async log(@Body() dto: LogSearchKeywordDto, @Req() req: Request, @Ip() ipAddress: string) {
    const authHeader = req.headers.authorization;
    await this.searchKeywordService.logSearchKeyword(dto, authHeader, ipAddress);
    return { success: true };
  }

  @ApiOperation({
    summary: 'Chip "Tìm kiếm phổ biến" cho trang chủ / trang việc làm',
    description:
      'Danh sách biên tập, đọc từ bảng popular_search_keywords. Công khai vì chính các chip này hiển thị trên trang công khai.',
  })
  @Get('popular')
  async getPopular(@Query() query: GetPopularKeywordsDto) {
    return this.searchKeywordService.getPopularKeywords(query);
  }

  @ApiOperation({
    summary: 'Top từ khóa được tìm nhiều nhất (ADMIN)',
    description:
      'Dữ liệu nhu cầu thị trường nên chỉ admin xem được. Trước đây endpoint này không có guard và trả 200 cho mọi request.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('analytics:view')
  @Get('top')
  async getTop(@Query() query: GetTopSearchKeywordsDto) {
    return this.searchKeywordService.getTopSearchKeywords(query);
  }

  @ApiOperation({
    summary: 'Số tổng và mức thay đổi so với kỳ trước (ADMIN)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('analytics:view')
  @Get('analytics/overview')
  async getOverview(@Query() query: KeywordAnalyticsQueryDto) {
    return this.keywordAnalyticsService.getOverview(query);
  }

  @ApiOperation({
    summary: 'Từ khóa tìm mà không ra kết quả (ADMIN)',
    description: 'Mỗi dòng là một nhu cầu chưa có tin tuyển dụng nào đáp ứng.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('analytics:view')
  @Get('analytics/zero-results')
  async getZeroResults(@Query() query: KeywordAnalyticsQueryDto) {
    return this.keywordAnalyticsService.getZeroResultKeywords(query);
  }

  @ApiOperation({
    summary: 'Đối chiếu cầu tìm kiếm với cung tin tuyển dụng (ADMIN)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('analytics:view')
  @Get('analytics/supply-gap')
  async getSupplyGap(@Query() query: KeywordAnalyticsQueryDto) {
    return this.keywordAnalyticsService.getSupplyGap(query);
  }

  @ApiOperation({
    summary: 'Lượt tìm theo từng ngày (ADMIN)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('analytics:view')
  @Get('analytics/trend')
  async getTrend(@Query() query: KeywordTrendQueryDto) {
    return this.keywordAnalyticsService.getTrend(query);
  }
}
