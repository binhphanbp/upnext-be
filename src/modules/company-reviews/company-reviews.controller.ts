import { Controller, Get, Post, Patch, Delete, Param, ParseUUIDPipe, Body, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CompanyReviewsService } from './company-reviews.service';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';

@ApiBearerAuth()
@Controller()
export class CompanyReviewsController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  @ApiTags('companies')
  @ApiOperation({ summary: 'Create Company Review' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Post('companies/:id/reviews')
  createReview(
    @Param('id', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateCompanyReviewDto,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyReviewsService.createReview(candidateAccountId, companyId, dto);
  }

  @ApiTags('companies')
  @ApiOperation({ summary: 'List Company Reviews' })
  @Get('companies/:id/reviews')
  listReviews(@Param('id', ParseUUIDPipe) companyId: string) {
    return this.companyReviewsService.listReviews(companyId);
  }

  @ApiTags('company-reviews')
  @ApiOperation({ summary: 'Update Company Review' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Patch('company-reviews/:id')
  updateReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyReviewDto,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyReviewsService.updateReview(id, candidateAccountId, dto);
  }

  @ApiTags('company-reviews')
  @ApiOperation({ summary: 'Delete Company Review' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Delete('company-reviews/:id')
  @HttpCode(204)
  deleteReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.companyReviewsService.deleteReview(id, candidateAccountId);
  }
}
