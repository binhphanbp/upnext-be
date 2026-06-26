import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAdminPermissionDto {
  @ApiProperty({ maxLength: 120, example: 'Quản lý báo cáo' })
  @IsString()
  @MaxLength(120)
  permissionName!: string;

  @ApiProperty({ maxLength: 120, example: 'reports:manage' })
  @IsString()
  @MaxLength(120)
  permissionCode!: string;

  @ApiProperty({ maxLength: 80, example: 'reports' })
  @IsString()
  @MaxLength(80)
  module!: string;

  @ApiPropertyOptional({ example: 'Cho phép duyệt và xử lý các báo cáo của người dùng' })
  @IsOptional()
  @IsString()
  description?: string;
}
