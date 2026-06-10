import { PartialType } from '@nestjs/swagger';
import { CreateRecruiterRoleDto } from './create-recruiter-role.dto';

export class UpdateRecruiterRoleDto extends PartialType(CreateRecruiterRoleDto) {}
