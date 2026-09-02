import { IsIn } from 'class-validator';

export class GenerateCompanyLetterTemplateDto {
  @IsIn(['OFFER', 'REJECTION'])
  type!: 'OFFER' | 'REJECTION';
}
