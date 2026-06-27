import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';
import { CreateShortlistDto } from './dto/create-shortlist.dto';

@ApiTags('Recruiter - Shortlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/shortlists')
export class RecruiterShortlistsController {
  constructor(private readonly recruiterShortlistsService: RecruiterShortlistsService) {}

  @Post()
  @ApiOperation({ summary: 'Thêm ứng viên vào danh sách rút gọn' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  addToShortlist(
    @Body() dto: CreateShortlistDto,
    @Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string,
  ) {
    return this.recruiterShortlistsService.addToShortlist(recruiterAccountId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa ứng viên khỏi danh sách rút gọn' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  removeFromShortlist(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string,
  ) {
    return this.recruiterShortlistsService.removeFromShortlist(id, recruiterAccountId);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách ứng viên rút gọn của tôi' })
  @ApiQuery({ name: 'recruiterAccountId', required: true, description: 'Recruiter account UUID' })
  listShortlist(@Query('recruiterAccountId', new ParseUUIDPipe()) recruiterAccountId: string) {
    return this.recruiterShortlistsService.listShortlist(recruiterAccountId);
  }
}
