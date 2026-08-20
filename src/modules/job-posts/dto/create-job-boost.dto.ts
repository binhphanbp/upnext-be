import { ApiProperty } from '@nestjs/swagger';
import { JobBoostType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateJobBoostDto {
  @ApiProperty({ enum: JobBoostType, description: 'FEATURED (Nổi bật) hoặc URGENT (Tuyển gấp).' })
  @IsEnum(JobBoostType)
  type: JobBoostType;
}
