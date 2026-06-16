import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateEmploymentTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;
}
