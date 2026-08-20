import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Put,
  Query,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SubscriptionPlansService } from './subscription-plans.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SetPlanFeaturesDto } from './dto/set-plan-features.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorType, PlanAudience } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Subscription Plans')
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly plansService: SubscriptionPlansService) {}

  @ApiOperation({ summary: 'Tạo gói dịch vụ mới (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSubscriptionPlanDto) {
    return this.plansService.create(user.id, dto);
  }

  /**
   * Admin-only on purpose: `findAll()` returns every plan regardless of
   * `status`/`isPublic`, including drafts and retired plans -- full price and
   * feature limits included. There is a separate, safe, unauthenticated route
   * for anyone who just needs the plans that are actually on sale:
   * `GET /subscription-plans/public`.
   */
  @ApiOperation({ summary: 'Lấy danh sách tất cả gói dịch vụ (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  // Declared before @Get(':id') on purpose: otherwise "public" is captured as an
  // id and rejected by ParseUUIDPipe.
  @ApiOperation({
    summary: 'Lấy các gói đang mở bán cho trang Pricing (không cần đăng nhập)',
  })
  @ApiQuery({ name: 'audience', enum: PlanAudience, required: false })
  @Get('public')
  findPublic(@Query('audience') audience?: PlanAudience) {
    return this.plansService.findPublic(audience ?? PlanAudience.RECRUITER);
  }

  /** Same reasoning as `findAll()` above: a draft/retired plan's full price and
   * feature limits should not be readable by guessing or enumerating a UUID.
   * No frontend caller currently uses this route directly -- callers that need
   * a single plan's public data go through `findPublic()`. */
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một gói dịch vụ (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.findOne(id);
  }

  @ApiOperation({ summary: 'Đặt lại hạn mức các tính năng của gói (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Put(':id/features')
  setFeatures(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPlanFeaturesDto) {
    return this.plansService.setFeatures(id, dto);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin gói dịch vụ (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.plansService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa gói dịch vụ (Chỉ dành cho Admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.remove(id);
  }
}
