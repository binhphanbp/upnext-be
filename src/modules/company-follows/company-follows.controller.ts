import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyFollowsService } from './company-follows.service';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller()
export class CompanyFollowsController {
  constructor(private readonly companyFollowsService: CompanyFollowsService) {}

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Theo dõi công ty' })
  @Post('companies/:id/follow')
  followCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyFollowsService.followCompany(user.id, companyId);
  }

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Bỏ theo dõi công ty' })
  @Delete('companies/:id/follow')
  @HttpCode(204)
  unfollowCompany(
    @Param('id', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyFollowsService.unfollowCompany(user.id, companyId);
  }

  @ApiTags('Companies')
  @ApiOperation({ summary: 'Danh sách công ty đang theo dõi' })
  @Get('company-follows/me')
  listFollowingCompanies(@CurrentUser() user: AuthenticatedUser) {
    return this.companyFollowsService.listFollowingCompanies(user.id);
  }
}
