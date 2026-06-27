import { PartialType } from '@nestjs/swagger';
import { CreateCandidateSkillDto } from './create-candidate-skill.dto';

export class UpdateCandidateSkillDto extends PartialType(CreateCandidateSkillDto) {}
