import { Body, Controller, Get, Ip, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { LogSearchKeywordDto } from './dto/log-search-keyword.dto';
import { GetTopSearchKeywordsDto } from './dto/get-top-search-keywords.dto';
import { SearchKeywordService } from './search-keyword.service';

@ApiTags('Search - Keywords')
@Controller('search-keywords')
export class SearchKeywordController {
  constructor(private readonly searchKeywordService: SearchKeywordService) {}

  @ApiOperation({ summary: 'Lưu lại từ khóa người dùng tìm kiếm' })
  @Post('log')
  async log(
    @Body() dto: LogSearchKeywordDto,
    @Req() req: Request,
    @Ip() ipAddress: string,
  ) {
    const authHeader = req.headers.authorization;
    await this.searchKeywordService.logSearchKeyword(dto, authHeader, ipAddress);
    return { success: true };
  }

  @ApiOperation({ summary: 'Lấy danh sách top từ khóa được tìm kiếm nhiều nhất' })
  @Get('top')
  async getTop(@Query() query: GetTopSearchKeywordsDto) {
    return this.searchKeywordService.getTopSearchKeywords(query);
  }
}

