import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateApplicationCvDto {
  @ApiProperty({ example: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf', description: 'CV version UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  cvVersionId!: string;
}
