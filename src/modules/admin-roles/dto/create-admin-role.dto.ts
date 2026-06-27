import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAdminRoleDto {
  @ApiProperty({ maxLength: 120, example: 'super_admin' })
  @IsString()
  @MaxLength(120)
  roleName!: string;

  @ApiPropertyOptional({ example: 'Quyền truy cập quản trị hệ thống đầy đủ' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RoleStatus, default: RoleStatus.ACTIVE, example: RoleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;
}
