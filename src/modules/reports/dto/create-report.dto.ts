import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ description: 'Loại đối tượng bị báo cáo (ví dụ: JOB_POST, COMPANY, CANDIDATE)' })
  @IsString()
  @IsNotEmpty()
  targetType: string;

  @ApiProperty({ description: 'UUID của đối tượng bị báo cáo' })
  @IsUUID()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ description: 'Lý do báo cáo' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'UUID của file bằng chứng' })
  @IsOptional()
  @IsUUID()
  evidenceFileId?: string;
}
