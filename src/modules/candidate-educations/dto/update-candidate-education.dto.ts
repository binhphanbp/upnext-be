import { PartialType } from '@nestjs/swagger';
import { CreateCandidateEducationDto } from './create-candidate-education.dto';

export class UpdateCandidateEducationDto extends PartialType(CreateCandidateEducationDto) {}
