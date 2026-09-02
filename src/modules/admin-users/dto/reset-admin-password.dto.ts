import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetAdminPasswordDto {
  @ApiProperty({ example: 'NewSecurePassword123!', description: 'Mật khẩu mới (tối thiểu 8 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(8, { message: 'Mật khẩu phải có tối thiểu 8 ký tự' })
  newPassword!: string;
}
