import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadedFile as CloudinaryUploadedFile } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileUploadResponse, MultipleFileUploadResponse } from './entities/file-asset.entity';
import { FilesService } from './files.service';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file lên Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string' },
        visibility: { type: 'string' },
        ownerType: { type: 'string' },
        ownerId: { type: 'string', format: 'uuid' },
        actorType: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: FileUploadResponse })
  upload(
    @UploadedFile() file: CloudinaryUploadedFile,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.upload(file, dto, user);
  }

  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiOperation({ summary: 'Upload nhiều file lên Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        purpose: { type: 'string' },
        visibility: { type: 'string' },
        ownerType: { type: 'string' },
        ownerId: { type: 'string', format: 'uuid' },
        actorType: { type: 'string' },
      },
      required: ['files'],
    },
  })
  @ApiCreatedResponse({ type: MultipleFileUploadResponse })
  uploadMany(
    @UploadedFiles() files: CloudinaryUploadedFile[],
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.uploadMany(files, dto, user);
  }
}
