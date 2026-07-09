import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateJobPostVisibilityDto {
  @ApiProperty({
    description: 'Trạng thái ẩn hoặc hiển thị tin tuyển dụng.',
    example: true,
  })
  @IsBoolean({ message: 'isHidden phải là kiểu Boolean (true/false).' })
  @IsNotEmpty({ message: 'isHidden không được để trống.' })
  isHidden!: boolean;
}
