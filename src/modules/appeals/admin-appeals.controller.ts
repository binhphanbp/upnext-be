import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AppealStatus } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppealsService } from './appeals.service';
import { ResolveAppealDto } from './dto/resolve-appeal.dto';

@ApiTags('Admin - Appeals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/appeals')
export class AdminAppealsController {
  constructor(private readonly appealsService: AppealsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách kháng cáo cho Admin' })
  @ApiOkResponse({ description: 'Lấy danh sách kháng cáo thành công.' })
  findAll(@Query('status') status?: AppealStatus) {
    return this.appealsService.findAllForAdmin(status);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Duyệt hoặc từ chối kháng cáo' })
  @ApiOkResponse({ description: 'Cập nhật trạng thái kháng cáo thành công.' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAppealDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appealsService.resolve(id, user.id, dto.status);
  }
}
