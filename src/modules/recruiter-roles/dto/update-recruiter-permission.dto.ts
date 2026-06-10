import { PartialType } from '@nestjs/swagger';
import { CreateRecruiterPermissionDto } from './create-recruiter-permission.dto';

export class UpdateRecruiterPermissionDto extends PartialType(CreateRecruiterPermissionDto) {}
