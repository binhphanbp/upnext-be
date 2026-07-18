import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ChangeSupportCaseStatusDto,
  ClaimSupportCaseDto,
  TransferSupportCaseDto,
} from './dto/support-case-actions.dto';
import { SupportCaseService } from './support-case.service';

@Controller('admin/support-cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
export class AdminSupportController {
  constructor(private readonly supportCases: SupportCaseService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.listAdmin(user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.detail(id, user);
  }

  @Get(':id/eligible-assignees')
  listEligibleAssignees(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supportCases.listEligibleAssignees(id, user);
  }

  @Post(':id/claim')
  claim(
    @Param('id') id: string,
    @Body() dto: ClaimSupportCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportCases.claim(id, dto, user);
  }

  @Post(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferSupportCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportCases.transfer(id, dto, user);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeSupportCaseStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportCases.changeStatus(id, dto, user);
  }
}
