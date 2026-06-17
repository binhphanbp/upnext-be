import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateAccountService } from './candidate-account.service';
import { UpdateCandidateAccountStatusDto } from './dto/update-candidate-account-status.dto';
import { UpdateMyCandidateAccountDto } from './dto/update-my-candidate-account.dto';
import { CandidateAccount, CandidateAccountList } from './entities/candidate-account.entity';

@ApiTags('Candidate - Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('candidate-accounts')
export class CandidateAccountController {
  constructor(private readonly candidateAccountService: CandidateAccountService) { }

  @Get('me')
  @Roles(ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Lấy thông tin tài khoản ứng viên' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ ứng viên mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateAccountService.findOne(user.id);
  }

  @Patch('me')
  @Roles(ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Ứng viên đổi mật khẩu tài khoản' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiBadRequestResponse({ description: 'Dữ liệu yêu cầu không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ ứng viên mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateMyCandidateAccountDto: UpdateMyCandidateAccountDto,
  ) {
    return this.candidateAccountService.updateMe(user.id, updateMyCandidateAccountDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tài khoản ứng viên (ADMIN)' })
  @ApiOkResponse({ type: CandidateAccountList })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ admin mới có thể gọi endpoint này.' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.candidateAccountService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết tài khoản ứng viên (ADMIN)' })
  @ApiParam({ name: 'id', example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ admin mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.candidateAccountService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Admin cập nhật trạng thái tài khoản ứng viên' })
  @ApiParam({ name: 'id', example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiBadRequestResponse({ description: 'Dữ liệu yêu cầu không hợp lệ.' })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ admin mới có thể gọi endpoint này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCandidateAccountStatusDto: UpdateCandidateAccountStatusDto,
  ) {
    return this.candidateAccountService.updateStatus(id, updateCandidateAccountStatusDto);
  }
}
