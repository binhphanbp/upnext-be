import { PartialType } from '@nestjs/swagger';
import { CreateCvTemplateDto } from './create-cv-template.dto';

export class UpdateCvTemplateDto extends PartialType(CreateCvTemplateDto) {}
