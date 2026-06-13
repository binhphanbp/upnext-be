import { PartialType } from '@nestjs/swagger';
import { CreateCandidateAccountDto } from './create-candidate-account.dto';

export class UpdateCandidateAccountDto extends PartialType(CreateCandidateAccountDto) {}
