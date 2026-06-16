import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CreateJobPostDto } from './create-job-post.dto';

export class CreateJobPostWithContextDto extends CreateJobPostDto {
  @ApiProperty({ description: 'Recruiter account UUID', example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @IsUUID('4')
  recruiterId!: string;

  @ApiProperty({ description: 'Company UUID', example: '8e10280c-ae2d-4579-a048-c25279447a3e' })
  @IsUUID('4')
  companyId!: string;
}
