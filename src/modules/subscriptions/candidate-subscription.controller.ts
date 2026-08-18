import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateSubscriptionQuotaService } from './candidate-subscription-quota.service';

@ApiTags('Candidate - Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-subscriptions')
export class CandidateSubscriptionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: CandidateSubscriptionQuotaService,
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
        },
        usage,
      },
    };
  }
}
