import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAdminRoleDto {
  @ApiPropertyOptional({ maxLength: 80, example: 'CONTENT_CREATOR' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleCode?: string;

  @ApiProperty({ maxLength: 120, example: 'Chuyên viên Nội dung' })
  @IsString()
  @MaxLength(120)
  roleName!: string;

  @ApiPropertyOptional({ example: 'Quản trị viên duyệt bài viết và tin đăng' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RoleStatus, default: RoleStatus.ACTIVE, example: RoleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách UUID quyền hạn được gán ban đầu' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
