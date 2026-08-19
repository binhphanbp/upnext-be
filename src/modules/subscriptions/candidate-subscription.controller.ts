import { Body, Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateSubscriptionQuotaService } from './candidate-subscription-quota.service';
import { CandidateSandboxCheckoutDto } from './dto/candidate-sandbox-checkout.dto';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

@ApiTags('Candidate - Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-subscriptions')
export class CandidateSubscriptionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: CandidateSubscriptionQuotaService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Gói hiện tại và hạn mức AI của ứng viên đang đăng nhập' })
  @ApiOkResponse({ description: 'Gói đang hiệu lực và hạn mức từng tính năng trong chu kỳ.' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');

    // Resolve the subscription first. Both calls auto-provision the Free plan
    // for a new candidate; running them concurrently could create duplicate
    // subscriptions on a candidate's first visit.
    const subscription = await this.quota.activePlan(profile.id);
    const usage = await this.quota.peek(profile.id);
    return {
      data: {
        plan: {
          code: subscription.plan.code,
          name: subscription.plan.subscriptionName,
          audience: subscription.plan.audience,
          expiresAt: subscription.expiredAt,
          periodStart: subscription.currentPeriodStart ?? subscription.startedAt,
          periodEnd: subscription.currentPeriodEnd ?? subscription.expiredAt,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          cancelRequestedAt: subscription.cancelRequestedAt,
          source: subscription.source,
        },
        usage,
      },
    };
  }

  @Post('sandbox-checkout')
  @ApiOperation({
    summary: 'Nâng cấp gói ứng viên trong môi trường sandbox',
    description:
      'Chỉ dùng cho rollout thử nghiệm có kiểm soát. Khóa idempotency bắt buộc để một lần nhấn không tạo hai gói.',
  })
  async sandboxCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CandidateSandboxCheckoutDto,
  ) {
    const profile = await this.requireProfile(user.id);
    return this.lifecycle.candidateSandboxCheckout(profile.id, user, dto);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Yêu cầu hủy gia hạn vào cuối chu kỳ gói hiện tại' })
  async cancel(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user.id);
    return this.lifecycle.requestCandidateCancellation(profile.id, user);
  }

  @Post('cancel/revoke')
  @ApiOperation({ summary: 'Giữ lại gói hiện tại, hủy yêu cầu không gia hạn' })
  async revokeCancellation(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.requireProfile(user.id);
    return this.lifecycle.revokeCandidateCancellation(profile.id, user);
  }

  private async requireProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');
    return profile;
  }
}
