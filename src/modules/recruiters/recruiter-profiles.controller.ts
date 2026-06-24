import {
  Body,
  Controller,
  Delete,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateRecruiterProfileDto } from './dto/recruiter-profiles/create-recruiter-profile.dto';
import { UpdateRecruiterProfileDto } from './dto/recruiter-profiles/update-recruiter-profile.dto';
import { RecruitersService } from './recruiters.service';

@ApiTags('Recruiter - Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER, ActorType.ADMIN)
@Controller('recruiter-profiles')
export class RecruiterProfilesController {
  constructor(private readonly recruitersService: RecruitersService) {}

  @ApiOperation({
    summary: 'Tạo hồ sơ nhà tuyển dụng',
    description: 'Tạo hồ sơ recruiter gắn với một tài khoản recruiter.',
  })
  @ApiCreatedResponse({
    description: 'Recruiter profile created successfully',
    schema: {
      example: {
        id: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
        recruiterAccountId: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        fullName: 'Nguyen Van A',
        phoneNumber: '+84-912-345-678',
        gender: 'MALE',
        avatarUrl: null,
        createdAt: '2026-06-09T08:00:00.000Z',
        updatedAt: '2026-06-09T08:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Profile for this recruiter account already exists' })
  @ApiNotFoundResponse({ description: 'Recruiter account not found' })
  @Post()
  create(@Body() dto: CreateRecruiterProfileDto) {
    return this.recruitersService.createProfile(dto);
  }

  @ApiOperation({
    summary: 'Lấy hồ sơ nhà tuyển dụng của tôi',
    description: 'Recruiter xem hồ sơ của chính mình theo account id.',
  })
  @ApiQuery({ name: 'accountId', description: 'Recruiter account UUID', required: true })
  @ApiOkResponse({
    description: 'Recruiter profile fetched successfully',
    schema: {
      example: {
        id: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
        fullName: 'Nguyen Van A',
        phoneNumber: '+84-912-345-678',
        gender: 'MALE',
        avatarUrl: null,
        recruiterAccount: {
          id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
          email: 'recruiter@company.com',
          status: 'ACTIVE',
          company: { id: 'c1...', name: 'UpNext Labs' },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Recruiter profile not found' })
  @Get('me')
  findMe(@Query('accountId', new ParseUUIDPipe()) accountId: string) {
    return this.recruitersService.findMyProfile(accountId);
  }

  @ApiOperation({
    summary: 'Lấy chi tiết hồ sơ nhà tuyển dụng',
    description: 'Xem chi tiết hồ sơ recruiter theo profile id.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter profile UUID' })
  @ApiOkResponse({
    description: 'Recruiter profile fetched successfully',
    schema: {
      example: {
        id: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
        fullName: 'Nguyen Van A',
        phoneNumber: '+84-912-345-678',
        gender: 'MALE',
        avatarUrl: null,
        recruiterAccount: {
          id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
          email: 'recruiter@company.com',
          status: 'ACTIVE',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Recruiter profile not found' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruitersService.findOneProfile(id);
  }

  @ApiOperation({
    summary: 'Cập nhật hồ sơ nhà tuyển dụng',
    description: 'Cập nhật chức danh, số điện thoại, avatar của recruiter.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter profile UUID' })
  @ApiOkResponse({
    description: 'Recruiter profile updated successfully',
    schema: {
      example: {
        id: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
        fullName: 'Nguyen Van B',
        phoneNumber: '+84-912-999-888',
        updatedAt: '2026-06-09T10:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiNotFoundResponse({ description: 'Recruiter profile not found' })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecruiterProfileDto,
  ) {
    return this.recruitersService.updateProfile(id, dto);
  }

  @ApiOperation({
    summary: 'Xóa hồ sơ nhà tuyển dụng',
    description: 'Xóa hồ sơ recruiter theo profile id.',
  })
  @ApiParam({ name: 'id', description: 'Recruiter profile UUID' })
  @ApiNoContentResponse({ description: 'Recruiter profile deleted successfully' })
  @ApiNotFoundResponse({ description: 'Recruiter profile not found' })
  @Roles(ActorType.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.recruitersService.removeProfile(id);
  }
}
