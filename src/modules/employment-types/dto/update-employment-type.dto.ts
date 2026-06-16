import { PartialType } from '@nestjs/swagger';
import { CreateEmploymentTypeDto } from './create-employment-type.dto';
export class UpdateEmploymentTypeDto extends PartialType(CreateEmploymentTypeDto) {}
