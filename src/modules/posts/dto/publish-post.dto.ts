import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class PublishPostDto {
  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  expectedUpdatedAt: string;
}
