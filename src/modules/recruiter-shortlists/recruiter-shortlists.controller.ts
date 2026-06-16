import { Controller, Post, Delete, Get, Body, Param, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';
import { CreateShortlistDto } from './dto/create-shortlist.dto';

@ApiTags('recruiter-shortlists')
@ApiBearerAuth()
@Controller('recruiter/shortlists')
export class RecruiterShortlistsController {
  constructor(private readonly recruiterShortlistsService: RecruiterShortlistsService) {}

  @Post()
  @ApiOperation({ summary: 'Add Candidate To Shortlist' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  addToShortlist(
    @Body() dto: CreateShortlistDto,
    @Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string,
  ) {
    return this.recruiterShortlistsService.addToShortlist(recruiterAccountId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove Candidate From Shortlist' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  removeFromShortlist(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string,
  ) {
    return this.recruiterShortlistsService.removeFromShortlist(id, recruiterAccountId);
  }

  @Get()
  @ApiOperation({ summary: 'List My Shortlisted Candidates' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  listShortlist(
    @Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string,
  ) {
    return this.recruiterShortlistsService.listShortlist(recruiterAccountId);
  }
}
