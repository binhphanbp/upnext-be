import { PartialType } from '@nestjs/swagger';
import { CreateCandidateLanguageDto } from './create-candidate-language.dto';

export class UpdateCandidateLanguageDto extends PartialType(CreateCandidateLanguageDto) {}
