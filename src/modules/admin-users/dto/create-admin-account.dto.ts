import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminAccountDto {
  @ApiProperty({ example: 'admin.moderator@upnext.dev', description: 'Email công vụ của Admin' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên đầy đủ' })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: 'Password123!', description: 'Mật khẩu khởi tạo (tối thiểu 8 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  password!: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại liên hệ' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg', description: 'Ảnh đại diện' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'UUID của Vai trò Admin được gán' })
  @IsOptional()
  @IsUUID('4', { message: 'ID vai trò không hợp lệ' })
  roleId?: string;

  @ApiPropertyOptional({ enum: AdminStatus, default: AdminStatus.ACTIVE, example: AdminStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AdminStatus)
  status?: AdminStatus;
}
