import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ListRecruiterAccountsQueryDto } from './dto/recruiter-accounts/list-recruiter-accounts-query.dto';
import { UpdateRecruiterAccountDto } from './dto/recruiter-accounts/update-recruiter-account.dto';
import { RecruitersService } from './recruiters.service';

@ApiTags('recruiter-accounts')
@Controller('recruiter-accounts')
export class RecruiterAccountsController {
  constructor(private readonly recruitersService: RecruitersService) {}

  @ApiOperation({
    summary: 'List recruiter accounts',
    description: 'Admin xem danh sach tai khoan recruiter, co ho tro tim kiem va filter.',
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
  @Get()
  findAll(@Query() query: ListRecruiterAccountsQueryDto) {
    return this.recruitersService.findAllAccounts(query);
  }

  @ApiOperation({
    summary: 'Get recruiter account detail',
    description: 'Xem chi tiet tai khoan recruiter theo id.',
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
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruitersService.findOneAccount(id);
  }

  @ApiOperation({
    summary: 'Update recruiter account',
    description: 'Cap nhat thong tin tai khoan recruiter (email, role, company, status).',
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
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecruiterAccountDto,
  ) {
    return this.recruitersService.updateAccount(id, dto);
  }

  @ApiOperation({
    summary: 'Deactivate recruiter account',
    description: 'Khoa tai khoan recruiter (dat status thanh BANNED).',
  })
  @ApiParam({ name: 'id', description: 'Recruiter account UUID' })
  @ApiNoContentResponse({ description: 'Recruiter account deactivated successfully' })
  @ApiNotFoundResponse({ description: 'Recruiter account not found' })
  @Patch(':id/deactivate')
  @HttpCode(204)
  async deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.recruitersService.deactivateAccount(id);
  }
}
