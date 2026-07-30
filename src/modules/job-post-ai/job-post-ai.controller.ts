import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { Request } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ExtractJobPostDraftDto } from './dto/extract-job-post-draft.dto';
import { GenerateJobPostDraftDto } from './dto/generate-job-post-draft.dto';
import { SalaryInsightDto } from './dto/salary-insight.dto';
import { JobPostAiService, JobPostAiUploadFile } from './job-post-ai.service';
import { JobPostSalaryInsightService } from './job-post-salary-insight.service';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const jobPostUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (
    _request: Request,
    file: { mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(
      new BadRequestException('Chỉ hỗ trợ file PDF, DOCX, TXT hoặc ảnh JPG, PNG, WEBP.'),
      false,
    );
  },
};

@ApiTags('Job Post AI')
@ApiBearerAuth()
@Roles(ActorType.RECRUITER)
@UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard, ThrottlerGuard)
@Controller('job-post-ai')
export class JobPostAiController {
  constructor(
    private readonly service: JobPostAiService,
    private readonly salaryInsights: JobPostSalaryInsightService,
  ) {}

  @Post('generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tạo bản nháp JD mới bằng AI' })
  @ApiCreatedResponse({ description: 'AI đã tạo bản nháp để recruiter kiểm tra.' })
  @ApiBadRequestResponse({ description: 'Thông tin đầu vào hoặc danh mục không hợp lệ.' })
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateJobPostDraftDto) {
    return this.service.generate(user.id, dto);
  }

  @Post('salary-insights')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tham chiếu mức lương từ các tin IT tương đồng trên UpNext' })
  @ApiCreatedResponse({ description: 'Khoảng lương tham chiếu và độ tin cậy của dữ liệu.' })
  salaryInsight(@CurrentUser() user: AuthenticatedUser, @Body() dto: SalaryInsightDto) {
    return this.salaryInsights.analyze(dto, user.id);
  }

  @Post('extract')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tách dữ liệu có cấu trúc từ nội dung JD được dán' })
  @ApiCreatedResponse({ description: 'Đã tách JD thành bản nháp.' })
  extractText(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExtractJobPostDraftDto) {
    return this.service.extractText(user.id, dto.text);
  }

  @Post('extract-file')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', jobPostUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, DOCX, TXT, JPG, PNG hoặc WEBP; tối đa 8 MB.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Quét file JD và trả về bản nháp có cấu trúc' })
  extractFile(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: JobPostAiUploadFile) {
    return this.service.extractFile(user.id, file);
  }
}
