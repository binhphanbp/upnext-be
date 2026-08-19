import { Controller, Get, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanySubscriptionsService } from './company-subscriptions.service';
import { SubscribeCompanyDto } from './dto/subscribe-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RecruiterSandboxCheckoutDto } from './dto/recruiter-sandbox-checkout.dto';
import { SubscriptionLifecycleService } from '../subscriptions/subscription-lifecycle.service';

@ApiTags('Company Subscriptions')
@Controller('company-subscriptions')
export class CompanySubscriptionsController {
  constructor(
    private readonly subscriptionsService: CompanySubscriptionsService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

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

  @ApiOperation({
    summary: 'Nâng cấp gói nhà tuyển dụng trong môi trường sandbox',
    description:
      'Chỉ dùng cho rollout thử nghiệm có kiểm soát. Công ty luôn lấy từ phiên đăng nhập; khóa idempotency bắt buộc.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post('sandbox-checkout')
  sandboxCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecruiterSandboxCheckoutDto,
  ) {
    const companyId = this.requireCompany(user);
    return this.lifecycle.recruiterSandboxCheckout(companyId, user, dto);
  }

  @ApiOperation({ summary: 'Yêu cầu hủy gia hạn vào cuối chu kỳ gói công ty hiện tại' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post('cancel')
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.requestRecruiterCancellation(this.requireCompany(user), user);
  }

  @ApiOperation({ summary: 'Giữ lại gói công ty hiện tại, hủy yêu cầu không gia hạn' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post('cancel/revoke')
  revokeCancellation(@CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.revokeRecruiterCancellation(this.requireCompany(user), user);
  }

  private requireCompany(user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException('You are not associated with any company');
    return user.companyId;
  }
}
