import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SearchTalentPoolDto } from './dto/search-talent-pool.dto';
import { TalentPoolService } from './talent-pool.service';

@ApiTags('Recruiter - Talent Pool')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/talent-pool')
export class TalentPoolController {
  constructor(private readonly talentPool: TalentPoolService) {}

  @ApiOperation({
    summary: 'Tìm kiếm hồ sơ trong kho CV',
    description:
      'Chỉ trả về ứng viên đã đồng ý cả ba điều kiện: mở tìm việc, hồ sơ công khai, ' +
      'và cho phép liên hệ chủ động. Danh sách rút gọn, không có tên thật/email/SĐT.',
  })
  @ApiOkResponse({ description: 'Danh sách rút gọn, phân trang.' })
  @Get()
  search(@CurrentUser() user: AuthenticatedUser, @Query() dto: SearchTalentPoolDto) {
    return this.talentPool.search(this.requireCompanyId(user), dto);
  }

  @ApiOperation({
    summary: 'Mở khóa thông tin liên hệ của một hồ sơ',
    description:
      'Trừ 1 lượt cv_pool_view. Đã mở trước đó thì trả lại thông tin miễn phí, không trừ lần hai.',
  })
  @ApiOkResponse({ description: 'Thông tin liên hệ đầy đủ.' })
  @Post(':candidateProfileId/unlock')
  unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateProfileId', ParseUUIDPipe) candidateProfileId: string,
  ) {
    return this.talentPool.unlock(this.requireCompanyId(user), user.id, candidateProfileId);
  }

  private requireCompanyId(user: AuthenticatedUser): string {
    if (!user.companyId) throw new ForbiddenException('Not associated with a company');
    return user.companyId;
  }
}
