import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateJobPostMemberAccessDto {
  @ApiProperty({
    description: 'Whether the company member can access this job post.',
    example: false,
  })
  @IsBoolean()
  hasAccess!: boolean;
}
