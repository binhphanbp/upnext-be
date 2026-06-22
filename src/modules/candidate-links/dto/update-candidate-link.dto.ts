import { PartialType } from '@nestjs/swagger';
import { CreateCandidateLinkDto } from './create-candidate-link.dto';

export class UpdateCandidateLinkDto extends PartialType(CreateCandidateLinkDto) {}
