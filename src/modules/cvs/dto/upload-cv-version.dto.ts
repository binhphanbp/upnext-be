import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadCvVersionDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File PDF của phiên bản CV mới.',
  })
  @IsOptional()
  file?: unknown;

  @ApiPropertyOptional({
    example: '4d10280c-ae2d-4579-a048-c25279447a3f',
    description: 'UUID mẫu CV nếu phiên bản này được tạo từ một mẫu có sẵn.',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({
    example: 'Lập trình viên Backend NestJS có kinh nghiệm với Prisma và PostgreSQL.',
    description: 'Nội dung văn bản đã bóc tách từ file CV.',
  })
  @IsOptional()
  @IsString()
  parsedText?: string;
}
