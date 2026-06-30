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
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvsService } from './cvs.service';
import { CandidateAccountQueryDto, ListMyCvsQueryDto } from './dto/cv-query.dto';
import { CreateCvDto } from './dto/create-cv.dto';
import { UpdateCvDto } from './dto/update-cv.dto';
import { CvEntity, CvList } from './entities/cv.entity';

@ApiTags('Cvs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('cvs')
export class CvsController {
  constructor(private readonly cvsService: CvsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo CV' })
  @ApiCreatedResponse({ type: CvEntity, description: 'Tạo CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body hoặc tham số truy vấn không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên, file nguồn hoặc mẫu CV.' })
  create(@Body() createCvDto: CreateCvDto, @Query() query: CandidateAccountQueryDto) {
    return this.cvsService.create(query.candidateAccountId, createCvDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Lấy danh sách CV của ứng viên hiện tại' })
  @ApiOkResponse({ type: CvList, description: 'Danh sách CV của ứng viên.' })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  findMine(@Query() query: ListMyCvsQueryDto) {
    return this.cvsService.findMine(query.candidateAccountId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Thông tin chi tiết CV.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Cập nhật CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body hoặc UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateCvDto: UpdateCvDto) {
    return this.cvsService.update(id, updateCvDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa CV' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Xóa CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  @ApiConflictResponse({ description: 'CV đang được bản ghi khác sử dụng.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvsService.remove(id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Đặt CV mặc định' })
  @ApiParam({ name: 'id', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvEntity, description: 'Đặt CV mặc định thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  setDefault(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvsService.setDefault(id);
  }
}
