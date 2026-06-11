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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyReviewsService } from './company-reviews.service';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';

// ─── POST & GET reviews scoped under /companies/:id ──────────────────────────
@ApiTags('company-reviews')
@Controller('companies')
export class CompanyReviewsController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  @ApiOperation({ summary: 'Create company review' })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @ApiBearerAuth()
  @Post(':id/reviews')
  createReview(
    @Param('id', new ParseUUIDPipe()) companyId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
    @Body() dto: CreateCompanyReviewDto,
  ) {
    return this.companyReviewsService.createReview(candidateAccountId, companyId, dto);
  }

  @ApiOperation({ summary: 'List company reviews' })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @Get(':id/reviews')
  listReviews(@Param('id', new ParseUUIDPipe()) companyId: string) {
    return this.companyReviewsService.listReviews(companyId);
  }
}

// ─── PATCH & DELETE scoped under /company-reviews ────────────────────────────
@ApiTags('company-reviews')
@ApiBearerAuth()
@Controller('company-reviews')
export class CompanyReviewsMutationController {
  constructor(private readonly companyReviewsService: CompanyReviewsService) {}

  @ApiOperation({ summary: 'Update company review' })
  @ApiParam({ name: 'id', description: 'Company review UUID' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Patch(':id')
  updateReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
    @Body() dto: UpdateCompanyReviewDto,
  ) {
    return this.companyReviewsService.updateReview(id, candidateAccountId, dto);
  }

  @ApiOperation({ summary: 'Delete company review' })
  @ApiParam({ name: 'id', description: 'Company review UUID' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @Delete(':id')
  @HttpCode(204)
  async deleteReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    await this.companyReviewsService.deleteReview(id, candidateAccountId);
  }
}
