import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvPoolAiSearchService } from './cv-pool-ai-search.service';
import { AiSearchTalentPoolDto } from './dto/ai-search-talent-pool.dto';
import { SearchTalentPoolDto } from './dto/search-talent-pool.dto';
import { SendApplicationInvitationDto } from './dto/send-application-invitation.dto';
import { TalentPoolService } from './talent-pool.service';

/**
 * Route tĩnh (`capabilities`, `ai-search`) khai báo TRƯỚC route có
 * `:candidateProfileId` một cách cố ý -- Express khớp theo thứ tự khai báo, và
 * đảo ngược sẽ làm `GET .../capabilities` bị nuốt thành
 * `GET .../:candidateProfileId` với `candidateProfileId = "capabilities"`.
 */
@ApiTags('Recruiter - Talent Pool')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/talent-pool')
export class TalentPoolController {
  constructor(
    private readonly talentPool: TalentPoolService,
    private readonly aiSearch: CvPoolAiSearchService,
  ) {}

  @ApiOperation({ summary: 'Trạng thái quyền lợi Kho CV cho frontend' })
  @Get('capabilities')
  getCapabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.talentPool.getCapabilities(this.requireCompanyId(user));
  }

  @ApiOperation({
    summary: 'AI lọc Kho CV theo một Job Post (paid-only)',
    description: 'Trừ 1 lượt cv_pool_ai_search. Trả rỗng không charge.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('ai-search')
  async aiSearchByJobPost(
    @CurrentUser() user: AuthenticatedUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() body: AiSearchTalentPoolDto,
  ) {
    const companyId = this.requireCompanyId(user);
    await this.aiSearch.assertJobPostOwnedByCompany(companyId, body.jobPostId);
    return this.aiSearch.search(companyId, body.jobPostId, idempotencyKey);
  }

  @ApiOperation({
    summary: 'Tìm kiếm hồ sơ trong kho CV',
    description:
      'Chỉ trả về ứng viên đã đồng ý cả ba điều kiện: mở tìm việc, hồ sơ công khai, ' +
      'và cho phép liên hệ chủ động. Danh sách rút gọn, không có tên thật/email/SĐT. ' +
      'Miễn phí, không trừ lượt -- chỉ xem CHI TIẾT mới trừ.',
  })
  @ApiOkResponse({ description: 'Danh sách rút gọn, phân trang.' })
  @Get()
  search(@CurrentUser() user: AuthenticatedUser, @Query() dto: SearchTalentPoolDto) {
    return this.talentPool.search(this.requireCompanyId(user), dto);
  }

  @ApiOperation({
    summary: 'Xem chi tiết một hồ sơ trong Kho CV',
    description:
      'Trừ 1 lượt cv_pool_view NẾU đây là lần xem đầu tiên trong kỳ hiện tại. ' +
      'Gói chưa mua: che tên/email/SĐT/địa chỉ/link cá nhân. Gói đã mua: hiện đầy đủ.',
  })
  @Post(':candidateProfileId/view')
  viewDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateProfileId', ParseUUIDPipe) candidateProfileId: string,
  ) {
    return this.talentPool.viewDetail(this.requireCompanyId(user), user.id, candidateProfileId);
  }

  @ApiOperation({ summary: 'Gửi email mời ứng tuyển cho ứng viên trong Kho CV' })
  @Post(':candidateProfileId/application-invitations')
  sendApplicationInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateProfileId', ParseUUIDPipe) candidateProfileId: string,
    @Body() dto: SendApplicationInvitationDto,
  ) {
    return this.talentPool.sendApplicationInvitation(
      this.requireCompanyId(user),
      candidateProfileId,
      dto.message,
    );
  }

  @ApiOperation({
    summary: 'Tải CV gốc',
    description: 'Chỉ công ty đã mua gói VÀ đã xem chi tiết hồ sơ này trong kỳ hiện tại.',
  })
  @Get(':candidateProfileId/cv-download')
  getCvDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('candidateProfileId', ParseUUIDPipe) candidateProfileId: string,
  ) {
    return this.talentPool.getCvDownload(this.requireCompanyId(user), candidateProfileId);
  }

  @ApiOperation({
    summary: 'Đã ngừng mở khóa thông tin liên hệ trực tiếp',
    description:
      'Thay bằng `POST :candidateProfileId/view` (theo kỳ tháng) + quyền lợi gói ' +
      '`cv_pool_unlocked_profile`. Endpoint retired; always returns 410.',
  })
  @ApiOkResponse({ description: 'Endpoint retired; always returns 410.' })
  @Post(':candidateProfileId/unlock')
  unlock() {
    // Route vẫn khớp `:candidateProfileId/unlock` dù handler không khai tham
    // số -- Nest match theo pattern URL, không bắt buộc mọi path param phải
    // được destructure vào chữ ký hàm.
    throw new GoneException({
      code: 'CV_POOL_DIRECT_UNLOCK_RETIRED',
      message: 'Mở khóa thông tin liên hệ trực tiếp đã ngừng hoạt động.',
    });
  }

  private requireCompanyId(user: AuthenticatedUser): string {
    if (!user.companyId) throw new ForbiddenException('Not associated with a company');
    return user.companyId;
  }
}
