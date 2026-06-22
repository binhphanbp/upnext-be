import { PartialType } from '@nestjs/swagger';
import { CreateCandidateCertificationDto } from './create-candidate-certification.dto';

export class UpdateCandidateCertificationDto extends PartialType(CreateCandidateCertificationDto) {}
