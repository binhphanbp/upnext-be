import { Controller, Get, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanySubscriptionsService } from './company-subscriptions.service';
import { SubscribeCompanyDto } from './dto/subscribe-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Company Subscriptions')
@Controller('company-subscriptions')
export class CompanySubscriptionsController {
  constructor(private readonly subscriptionsService: CompanySubscriptionsService) {}

  @ApiOperation({
    summary: 'Admin cấp gói thủ công',
    description:
      'Checkout tự phục vụ không đi qua endpoint legacy này. Recruiter không thể tự kích hoạt gói hoặc chọn công ty khác.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Post()
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeCompanyDto) {
    return this.subscriptionsService.subscribe(user, dto);
  }

  @ApiOperation({
    summary: 'Lấy thông tin gói đang hoạt động của công ty hiện tại (Dành cho Recruiter)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Get('active')
  getActive(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new ForbiddenException('You are not associated with any company');
    }
    return this.subscriptionsService.getActiveSubscription(user.companyId);
  }

  @ApiOperation({
    summary: 'Xem lịch sử đăng ký gói dịch vụ (Admin xem tất cả, Recruiter xem của công ty mình)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN, ActorType.RECRUITER)
  @Get('history')
  getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getHistory(user);
  }
}
