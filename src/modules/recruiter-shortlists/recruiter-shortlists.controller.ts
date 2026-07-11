import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
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
  addToShortlist(@Body() dto: CreateShortlistDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recruiterShortlistsService.addToShortlist(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa ứng viên khỏi danh sách rút gọn' })
  removeFromShortlist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recruiterShortlistsService.removeFromShortlist(id, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách ứng viên rút gọn của tôi' })
  listShortlist(@CurrentUser() user: AuthenticatedUser) {
    return this.recruiterShortlistsService.listShortlist(user.id);
  }
}
