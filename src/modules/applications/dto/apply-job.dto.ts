import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ApplyJobDto {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf', description: 'Job post UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  jobPostId!: string;

  @ApiProperty({ example: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf', description: 'CV version UUID' })
  @IsUUID('loose')
  @IsNotEmpty()
  cvVersionId!: string;

  @ApiPropertyOptional({
    example:
      'I am highly interested in this role and believe my NestJS skills fit your requirements.',
    description: 'Optional cover letter text',
  })
  @IsString()
  @IsOptional()
  coverLetter?: string;
}
