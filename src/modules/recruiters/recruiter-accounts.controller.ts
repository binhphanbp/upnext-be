import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListRecruiterAccountsQueryDto } from './dto/recruiter-accounts/list-recruiter-accounts-query.dto';
import { UpdateRecruiterAccountDto } from './dto/recruiter-accounts/update-recruiter-account.dto';
import { ChangePasswordDto } from './dto/recruiter-accounts/change-password.dto';
import { RecruitersService } from './recruiters.service';

@ApiTags('Recruiter - Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recruiter-accounts')
export class RecruiterAccountsController {
  constructor(private readonly recruitersService: RecruitersService) {}

  @ApiOperation({
    summary: 'Danh sách tài khoản nhà tuyển dụng',
    description: 'Admin xem danh sách tài khoản recruiter, có hỗ trợ tìm kiếm và filter.',
  })
  @ApiOkResponse({
    description: 'Recruiter accounts fetched successfully',
    schema: {
      example: {
        items: [
          {
            id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
            email: 'recruiter@company.com',
            status: 'ACTIVE',
            company: { id: 'c1d2e3f4-...', name: 'UpNext Labs' },
            recruiterRole: { id: 'r1...', code: 'hr_manager', name: 'HR Manager' },
            profile: { id: 'p1...', fullName: 'Nguyen Van A' },
            createdAt: '2026-06-09T08:00:00.000Z',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    },
  })
  @Roles(ActorType.ADMIN)
  @Get()
  findAll(@Query() query: ListRecruiterAccountsQueryDto) {
    return this.recruitersService.findAllAccounts(query);
  }

  @ApiOperation({
    summary: 'Chi tiết tài khoản nhà tuyển dụng',
    description: 'Xem chi tiết tài khoản recruiter theo id.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiOkResponse({
    description: 'Recruiter account fetched successfully',
    schema: {
      example: {
        id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        email: 'recruiter@company.com',
        status: 'ACTIVE',
        company: { id: 'c1...', name: 'UpNext Labs', status: 'ACTIVE' },
        recruiterRole: { id: 'r1...', code: 'hr_manager', name: 'HR Manager' },
        profile: { id: 'p1...', fullName: 'Nguyen Van A', phoneNumber: '+84-912-345-678' },
        companyMembers: [],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Recruiter account not found' })
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruitersService.findOneAccount(id);
  }

  @ApiOperation({
    summary: 'Cập nhật tài khoản nhà tuyển dụng',
    description: 'Cập nhật thông tin tài khoản recruiter (email, role, company, status).',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiOkResponse({
    description: 'Recruiter account updated successfully',
    schema: {
      example: {
        id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        email: 'updated@company.com',
        status: 'ACTIVE',
        updatedAt: '2026-06-09T09:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiNotFoundResponse({ description: 'Recruiter account not found' })
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateRecruiterAccountDto) {
    return this.recruitersService.updateAccount(id, dto);
  }

  @ApiOperation({
    summary: 'Thống kê dashboard nhà tuyển dụng',
    description: 'Lấy tổng số bài đăng và tổng số ứng viên của recruiter.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiOkResponse({
    description: 'Recruiter stats fetched successfully',
    schema: {
      example: {
        totalJobPosts: 12,
        totalCandidates: 45,
      },
    },
  })
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Get(':id/dashboard-stats')
  async getDashboardStats(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruitersService.getDashboardStats(id);
  }

  @ApiOperation({
    summary: 'Đổi mật khẩu tài khoản nhà tuyển dụng',
    description: 'Recruiter tự thay đổi mật khẩu của mình.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiOkResponse({ description: 'Đổi mật khẩu thành công' })
  @ApiBadRequestResponse({
    description: 'Mật khẩu hiện tại không chính xác hoặc dữ liệu không hợp lệ',
  })
  @Roles(ActorType.RECRUITER)
  @Post(':id/change-password')
  async changePassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.recruitersService.changePassword(id, dto);
  }

  @ApiOperation({
    summary: 'Vô hiệu hóa tài khoản nhà tuyển dụng',
    description: 'Khóa tài khoản recruiter (đặt status thành BANNED).',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiNoContentResponse({ description: 'Recruiter account deactivated successfully' })
  @ApiNotFoundResponse({ description: 'Recruiter account not found' })
  @Roles(ActorType.ADMIN)
  @Patch(':id/deactivate')
  @HttpCode(204)
  async deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.recruitersService.deactivateAccount(id);
  }
}
