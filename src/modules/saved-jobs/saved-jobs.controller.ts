import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SavedJobsService } from './saved-jobs.service';
import { SaveJobDto } from './dto/save-job.dto';

@ApiTags('Saved - Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('saved-jobs')
export class SavedJobsController {
  constructor(private readonly savedJobsService: SavedJobsService) {}

  @Post()
  @ApiOperation({ summary: 'Lưu việc làm' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  saveJob(
    @Body() dto: SaveJobDto,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.savedJobsService.saveJob(candidateAccountId, dto);
  }

  @Delete(':jobPostId')
  @ApiOperation({ summary: 'Hủy lưu việc làm' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  unsaveJob(
    @Param('jobPostId', ParseUUIDPipe) jobPostId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.savedJobsService.unsaveJob(candidateAccountId, jobPostId);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách việc làm đã lưu' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  listSavedJobs(@Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string) {
    return this.savedJobsService.listSavedJobs(candidateAccountId);
  }
}
