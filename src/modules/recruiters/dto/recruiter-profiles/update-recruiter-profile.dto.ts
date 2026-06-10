import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRecruiterProfileDto } from './create-recruiter-profile.dto';

export class UpdateRecruiterProfileDto extends PartialType(
  OmitType(CreateRecruiterProfileDto, ['recruiterAccountId'] as const),
) {}
