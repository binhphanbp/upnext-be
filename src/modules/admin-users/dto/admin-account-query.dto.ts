import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class AdminAccountQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Số trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Số lượng mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên, email, hoặc số điện thoại' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc theo UUID vai trò' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional({ enum: AdminStatus, description: 'Lọc theo trạng thái tài khoản' })
  @IsOptional()
  @IsEnum(AdminStatus)
  status?: AdminStatus;
}
