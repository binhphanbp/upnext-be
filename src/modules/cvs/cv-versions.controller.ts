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
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CvVersionsService } from './cv-versions.service';
import { UploadCvVersionDto } from './dto/upload-cv-version.dto';
import { CvVersion, CvVersionList } from './entities/cv.entity';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags('Phiên bản CV')
@Controller()
export class CvVersionsController {
  constructor(private readonly cvVersionsService: CvVersionsService) {}

  @Post('cvs/:cvId/versions')
  @UseInterceptors(FileInterceptor('file'))
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
  ) {
    return this.cvVersionsService.upload(cvId, uploadCvVersionDto, file);
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
  ) {
    return this.cvVersionsService.findAll(cvId, query);
  }

  @Get('cv-versions/:id')
  @ApiOperation({ summary: 'Xem chi tiết phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiOkResponse({ type: CvVersion, description: 'Thông tin chi tiết phiên bản CV.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvVersionsService.findOne(id);
  }

  @Get('cv-versions/:id/download')
  @ApiOperation({ summary: 'Tải xuống phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'File PDF của phiên bản CV.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV hoặc file CV.' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.cvVersionsService.prepareDownload(id);

    response.set({
      'Content-Type': download.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(download.fileName)}"`,
    });

    return new StreamableFile(download.stream);
  }

  @Post('cv-versions/:id/restore')
  @ApiOperation({ summary: 'Khôi phục phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiCreatedResponse({ type: CvVersion, description: 'Khôi phục phiên bản CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  restore(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvVersionsService.restore(id);
  }

  @Delete('cv-versions/:id')
  @ApiOperation({ summary: 'Xóa phiên bản CV' })
  @ApiParam({ name: 'id', description: 'UUID của phiên bản CV' })
  @ApiOkResponse({ type: CvVersion, description: 'Xóa phiên bản CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của phiên bản CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy phiên bản CV.' })
  @ApiConflictResponse({ description: 'Phiên bản CV đang được bản ghi khác sử dụng.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvVersionsService.remove(id);
  }
}
