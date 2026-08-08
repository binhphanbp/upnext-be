import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShortlistStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShortlistDto {
  @ApiPropertyOptional({ description: 'Độ ưu tiên, số lớn hơn nằm trên' })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ của đội tuyển dụng' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'ARCHIVED để lưu trữ thay vì xóa hẳn khỏi danh sách',
    enum: ShortlistStatus,
  })
  @IsOptional()
  @IsEnum(ShortlistStatus)
  status?: ShortlistStatus;
}
