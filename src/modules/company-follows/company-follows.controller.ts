import { Controller, Get, Post, Delete, Param, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CompanyFollowsService } from './company-follows.service';

@ApiBearerAuth()
@Controller()
export class CompanyFollowsController {
  constructor(private readonly companyFollowsService: CompanyFollowsService) {}

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Theo dõi công ty' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Post('companies/:id/follow')
  followCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.followCompany(candidateAccountId, companyId);
  }

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Bỏ theo dõi công ty' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Delete('companies/:id/follow')
  @HttpCode(204)
  unfollowCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.unfollowCompany(candidateAccountId, companyId);
  }

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Danh sách công ty đang theo dõi' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Get('company-follows/me')
  listFollowingCompanies(
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.listFollowingCompanies(candidateAccountId);
  }
}
