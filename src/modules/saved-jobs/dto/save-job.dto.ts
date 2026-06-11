import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SaveJobDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  jobPostId: string;
}
