import { IsIn } from 'class-validator';

export class GenerateCompanyLetterTemplateDto {
  @IsIn(['OFFER', 'REJECTION', 'INVITATION'])
  type!: 'OFFER' | 'REJECTION' | 'INVITATION';
}
