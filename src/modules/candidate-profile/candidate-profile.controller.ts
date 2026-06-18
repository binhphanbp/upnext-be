import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateProfileService } from './candidate-profile.service';
import { UpdateCandidateProfileDto } from './dto/update-candidate-profile.dto';
import { CandidateProfile } from './entities/candidate-profile.entity';

@ApiTags('Candidate - Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles')
export class CandidateProfileController {
  constructor(private readonly candidateProfileService: CandidateProfileService) { }

  @Get('me')
  @ApiOperation({ summary: 'Candidate get own profile' })
  @ApiOkResponse({ type: CandidateProfile })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc mã thông báo Bearer không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ ứng viên mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateProfileService.findMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Candidate update own profile' })
  @ApiOkResponse({ type: CandidateProfile })
  @ApiBadRequestResponse({ description: 'Dữ liệu yêu cầu không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc mã thông báo Bearer không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ ứng viên mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCandidateProfileDto,
  ) {
    return this.candidateProfileService.updateMe(user.id, dto);
  }
}
