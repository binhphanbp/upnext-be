import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ExtractJobPostDraftDto {
  @ApiProperty({
    description: 'Toàn bộ nội dung JD được dán trực tiếp.',
  })
  @IsString()
  @MinLength(60, { message: 'Nội dung JD cần tối thiểu 60 ký tự để AI trích xuất.' })
  @MaxLength(60000)
  text: string;
}
