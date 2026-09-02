import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AllowWhenRestricted } from '../../common/decorators/allow-when-restricted.decorator';
import { AppealsService } from './appeals.service';
import { CreateAppealDto } from './dto/create-appeal.dto';

@ApiTags('Recruiter - Appeals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('appeals')
export class AppealsController {
  constructor(private readonly appealsService: AppealsService) {}

  @Post()
  @AllowWhenRestricted()
  @ApiOperation({ summary: 'Gửi kháng cáo khi công ty đang ở chế độ Restricted Mode' })
  @ApiCreatedResponse({ description: 'Kháng cáo đã được gửi thành công.' })
  create(@Body() dto: CreateAppealDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appealsService.create(user.id, dto);
  }

  @Get()
  @AllowWhenRestricted()
  @ApiOperation({ summary: 'Xem danh sách kháng cáo đã gửi' })
  @ApiOkResponse({ description: 'Lấy danh sách kháng cáo thành công.' })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.appealsService.findAllForRecruiter(user.id);
  }
}
