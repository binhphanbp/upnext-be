import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { pdfUploadOptions } from '../../common/upload/multer-options';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CvVersionsService } from './cv-versions.service';
import { UploadCvVersionDto } from './dto/upload-cv-version.dto';
import { CreateBuilderCvVersionDto } from './dto/create-builder-cv-version.dto';
import { CvVersion, CvVersionList } from './entities/cv.entity';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags('Cv - Versions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
@Roles(ActorType.CANDIDATE)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller()
export class CvVersionsController {
  constructor(private readonly cvVersionsService: CvVersionsService) {}

  @Post('cvs/:cvId/versions')
  // Route đắt nhất của controller: ghi tối đa 10MB xuống ổ đĩa/Cloudinary mỗi
  // lần. Trước đây không có trần nào — một tài khoản có thể spam file vô hạn.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', pdfUploadOptions))
  @ApiOperation({ summary: 'Tải lên phiên bản CV mới' })
  @ApiParam({ name: 'cvId', description: 'UUID của CV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadCvVersionDto })
  @ApiCreatedResponse({ type: CvVersion, description: 'Tạo phiên bản CV mới thành công.' })
  @ApiBadRequestResponse({ description: 'File PDF, body hoặc UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV hoặc mẫu CV.' })
  upload(
    @Param('cvId', new ParseUUIDPipe()) cvId: string,
    @Body() uploadCvVersionDto: UploadCvVersionDto,
    @UploadedFile() file: UploadedFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cvVersionsService.upload(cvId, uploadCvVersionDto, file, user);
  }

  @Post('cvs/:cvId/builder-versions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Lưu một phiên bản bất biến từ CV Builder' })
  @ApiParam({ name: 'cvId', description: 'UUID của CV Builder' })
  @ApiCreatedResponse({ type: CvVersion, description: 'Đã lưu phiên bản Builder mới.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu CV hoặc trạng thái không hợp lệ.' })
  @ApiConflictResponse({
    description: 'CV đã được chỉnh sửa ở nơi khác hoặc đã đạt giới hạn phiên bản.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  createBuilderVersion(
    @Param('cvId', new ParseUUIDPipe()) cvId: string,
    @Body() dto: CreateBuilderCvVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cvVersionsService.createBuilderVersion(cvId, dto, user);
  }

  @Get('cvs/:cvId/versions')
  @ApiOperation({ summary: 'Lấy danh sách phiên bản của một CV' })
  @ApiParam({ name: 'cvId', description: 'UUID của CV' })
  @ApiOkResponse({ type: CvVersionList, description: 'Danh sách phiên bản CV.' })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn hoặc UUID của CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy CV.' })
  findAll(
    @Param('cvId', new ParseUUIDPipe()) cvId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cvVersionsService.findAll(cvId, query, user);
  }

  @Get('cv-versions/:id')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Xem chi tiết phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiOkResponse({ type: CvVersion, description: 'Thông tin chi tiết phiên bản CV.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvVersionsService.findOne(id, user);
  }

  @Get('cv-versions/:id/download')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Tải xuống phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'File PDF của phiên bản CV.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV hoặc file CV.' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const download = await this.cvVersionsService.prepareDownload(id, user);

    if (download.kind === 'redirect') {
      response.set('Cache-Control', 'private, no-store');
      return response.redirect(302, download.url);
    }

    response.set({
      'Content-Type': download.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(download.fileName)}"`,
    });

    return new StreamableFile(download.stream);
  }

  @Post('cv-versions/:id/restore')
  @ApiOperation({ summary: 'Khôi phục phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiCreatedResponse({ type: CvVersion, description: 'Khôi phục phiên bản CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  restore(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvVersionsService.restore(id, user);
  }

  @Delete('cv-versions/:id')
  @ApiOperation({ summary: 'Xóa phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiOkResponse({ type: CvVersion, description: 'Xóa phiên bản CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  @ApiConflictResponse({ description: 'Phiên bản CV đang được bản ghi khác sử dụng.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cvVersionsService.remove(id, user);
  }
}
