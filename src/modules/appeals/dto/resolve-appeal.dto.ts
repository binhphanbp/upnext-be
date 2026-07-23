import { ApiProperty } from '@nestjs/swagger';
import { AppealStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class ResolveAppealDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], description: 'Kết quả xử lý kháng cáo' })
  @IsNotEmpty()
  @IsEnum([AppealStatus.APPROVED, AppealStatus.REJECTED])
  status: 'APPROVED' | 'REJECTED';
}
