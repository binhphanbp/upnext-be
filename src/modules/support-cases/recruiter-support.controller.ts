import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSupportCaseDto } from './dto/create-support-case.dto';
import { SupportCaseService } from './support-case.service';

@Controller('support-cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
export class RecruiterSupportController {
  constructor(private readonly supportCases: SupportCaseService) {}

  @Post()
  create(@Body() dto: CreateSupportCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.listRecruiter(user);
  }

  @Get('eligible-job-posts')
  listEligibleJobPosts(@CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.listEligibleJobPosts(user);
  }

  @Get('creation-options')
  listCreationOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.listCreationOptions(user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.detail(id, user);
  }
}
