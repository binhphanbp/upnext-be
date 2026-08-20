import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ExtractJobPostDraftDto {
  @ApiProperty({
    description: 'Toàn bộ nội dung JD được dán trực tiếp.',
  })
  @IsString()
  @MinLength(60, { message: 'Nội dung JD cần tối thiểu 60 ký tự để AI trích xuất.' })
  @MaxLength(60000)
  text: string;

  @ApiPropertyOptional({
    description:
      'Khóa của client cho lần bấm này (UUID). Gửi kèm để một lần retry không bị trừ ' +
      'thêm lượt AI và không gọi lại model. Thiếu thì mỗi request được coi là một ' +
      'thao tác mới.',
    example: '9f1c6b1e-4a2f-4c3a-9c1d-2b7f5a0e8d31',
  })
  @IsUUID()
  @IsOptional()
  clientRequestId?: string;
}
