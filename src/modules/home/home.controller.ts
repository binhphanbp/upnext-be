import { Controller, Get, Query, VERSION_NEUTRAL, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { HomeQueryDto } from './dto/home-query.dto';
import { HomeService } from './home.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Home')
@Controller({ path: 'home', version: ['1', VERSION_NEUTRAL] })
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @ApiOperation({ summary: 'Lấy toàn bộ dữ liệu trang chủ' })
  @Get()
  getHome(@Query() query: HomeQueryDto) {
    return this.homeService.getHome(query);
  }

  @ApiOperation({ summary: 'Lấy dữ liệu trang chủ cá nhân hóa cho candidate' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @Get('candidate')
  getCandidateHome(@Query() query: HomeQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.homeService.getCandidateHome(user.id, query);
  }
}
