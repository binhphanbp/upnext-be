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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateShortlistDto } from './dto/create-shortlist.dto';
import { ListShortlistQueryDto } from './dto/list-shortlist-query.dto';
import { UpdateShortlistDto } from './dto/update-shortlist.dto';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';

@ApiTags('Recruiter - Shortlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/shortlists')
export class RecruiterShortlistsController {
  constructor(private readonly recruiterShortlistsService: RecruiterShortlistsService) {}

  @Post()
  @ApiOperation({ summary: 'Lưu ứng viên vào danh sách ứng viên tiềm năng của công ty' })
  addToShortlist(@Body() dto: CreateShortlistDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recruiterShortlistsService.addToShortlist(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách ứng viên đã lưu của công ty (mặc định cả công ty, lọc được của tôi)',
  })
  listShortlist(
    @Query() query: ListShortlistQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recruiterShortlistsService.listShortlist(user, query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật ghi chú, độ ưu tiên hoặc lưu trữ một ứng viên đã lưu' })
  updateShortlist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShortlistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recruiterShortlistsService.updateShortlist(id, user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa ứng viên khỏi danh sách đã lưu' })
  removeFromShortlist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recruiterShortlistsService.removeFromShortlist(id, user);
  }
}
