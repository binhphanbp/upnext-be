import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({
    description: 'Tên thẻ (Tag)',
    example: 'ReactJS',
  })
  @IsNotEmpty({ message: 'Tên thẻ không được để trống' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Slug thẻ (nếu để trống sẽ tự tạo từ name)',
    example: 'reactjs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  slug?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}
