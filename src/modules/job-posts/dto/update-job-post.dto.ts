import { PartialType } from '@nestjs/swagger';
import { CreateJobPostDto } from './create-job-post.dto';

export class UpdateJobPostDto extends PartialType(CreateJobPostDto) {}
