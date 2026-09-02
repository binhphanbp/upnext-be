import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminAccountDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn B', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: 'NewPassword123!', description: 'Mật khẩu mới (nếu muốn đổi)' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  password?: string;

  @ApiPropertyOptional({ example: '0987654321', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', description: 'Ảnh đại diện' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'UUID của Vai trò Admin mới' })
  @IsOptional()
  @IsUUID('4', { message: 'ID vai trò không hợp lệ' })
  roleId?: string;

  @ApiPropertyOptional({ enum: AdminStatus, example: AdminStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AdminStatus)
  status?: AdminStatus;
}
