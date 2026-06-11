import { PartialType } from '@nestjs/swagger';
import { CreateJobLocationDto } from './create-job-location.dto';
export class UpdateJobLocationDto extends PartialType(CreateJobLocationDto) {}
