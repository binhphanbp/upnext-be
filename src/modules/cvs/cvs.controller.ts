import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvsService } from './cvs.service';
import { ListMyCvsQueryDto } from './dto/cv-query.dto';
import { CreateCvDto } from './dto/create-cv.dto';
import { UpdateCvDto } from './dto/update-cv.dto';
import { CvEntity, CvList } from './entities/cv.entity';

@ApiTags('Cvs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
@Roles(ActorType.CANDIDATE)
// Trần mặc định cho route đọc — route tạo/ghi tự khai mức riêng bên dưới vì
// không route nào trong controller này từng có throttle nào (xem
// KE-HOACH-CV-BUILDER-AUDIT.md P0 — số CV/version tạo ra trước đây không giới
// hạn, một tài khoản có thể spam vô hạn).
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('cvs')
export class CvsController {
  constructor(private readonly cvsService: CvsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tạo CV' })
  @ApiCreatedResponse({ type: CvEntity, description: 'Tạo CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body hoặc tham số truy vấn không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên, file nguồn hoặc mẫu CV.' })
  create(@Body() createCvDto: CreateCvDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cvsService.create(user.id, createCvDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Lấy danh sách CV của ứng viên hiện tại' })
  @ApiOkResponse({ type: CvList, description: 'Danh sách CV của ứng viên.' })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  findMine(@Query() query: ListMyCvsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cvsService.findMine(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Thông tin chi tiết CV.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Cập nhật CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body hoặc UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCvDto: UpdateCvDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cvsService.update(id, updateCvDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Xóa CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  @ApiConflictResponse({ description: 'CV đang được bản ghi khác sử dụng.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvsService.remove(id, user.id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Đặt CV mặc định' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Đặt CV mặc định thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  setDefault(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvsService.setDefault(id, user.id);
  }
}
