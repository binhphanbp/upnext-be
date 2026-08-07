import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubscriptionQuotaService } from './subscription-quota.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionQuotaController {
  constructor(private readonly quota: SubscriptionQuotaService) {}

  @ApiOperation({
    summary: 'Lấy hạn mức đã dùng và còn lại của gói hiện tại',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Chỉ dành cho ADMIN khi xem hạn mức của một công ty cụ thể',
  })
  @ApiOkResponse({
    description: 'Danh sách hạn mức theo từng tính năng trong chu kỳ hiện tại.',
  })
  @Get('usage')
  getUsage(@CurrentUser() user: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const targetCompanyId = user.role === ActorType.ADMIN ? companyId : user.companyId;

    if (!targetCompanyId) {
      throw new ForbiddenException(
        user.role === ActorType.ADMIN
          ? 'companyId is required for admin'
          : 'You are not associated with any company',
      );
    }

    return this.quota.peek(targetCompanyId);
  }
}
