import { PartialType } from '@nestjs/swagger';
import { CreateCompanyReviewDto } from './create-company-review.dto';

export class UpdateCompanyReviewDto extends PartialType(CreateCompanyReviewDto) {}
