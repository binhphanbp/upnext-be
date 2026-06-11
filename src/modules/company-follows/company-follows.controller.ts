import { Controller, Get, Post, Delete, Param, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CompanyFollowsService } from './company-follows.service';

@ApiBearerAuth()
@Controller()
export class CompanyFollowsController {
  constructor(private readonly companyFollowsService: CompanyFollowsService) {}

  @ApiTags('companies')
  @ApiOperation({ summary: 'Follow Company' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Post('companies/:id/follow')
  followCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.followCompany(candidateAccountId, companyId);
  }

  @ApiTags('companies')
  @ApiOperation({ summary: 'Unfollow Company' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Delete('companies/:id/follow')
  @HttpCode(204)
  unfollowCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.unfollowCompany(candidateAccountId, companyId);
  }

  @ApiTags('company-follows')
  @ApiOperation({ summary: 'List Following Companies' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Get('company-follows/me')
  listFollowingCompanies(
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyFollowsService.listFollowingCompanies(candidateAccountId);
  }
}
