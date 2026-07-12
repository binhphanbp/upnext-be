import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
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
  saveJob(@Body() dto: SaveJobDto, @CurrentUser() user: AuthenticatedUser) {
    return this.savedJobsService.saveJob(user.id, dto);
  }

  @Delete(':jobPostId')
  @ApiOperation({ summary: 'Hủy lưu việc làm' })
  unsaveJob(
    @Param('jobPostId', ParseUUIDPipe) jobPostId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.savedJobsService.unsaveJob(user.id, jobPostId);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách việc làm đã lưu' })
  listSavedJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.savedJobsService.listSavedJobs(user.id);
  }
}
