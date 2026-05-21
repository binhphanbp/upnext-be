import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@ApiBearerAuth()
@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Roles(UserRole.CANDIDATE)
  @Post()
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.apply(user, dto);
  }

  @Roles(UserRole.CANDIDATE)
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.applicationsService.findMine(user, query);
  }

  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @Get('jobs/:jobId')
  findByJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.applicationsService.findByJob(user, jobId, query);
  }

  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(user, id, dto);
  }

  @Roles(UserRole.CANDIDATE)
  @Patch(':id/withdraw')
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.applicationsService.withdraw(user, id);
  }
}
