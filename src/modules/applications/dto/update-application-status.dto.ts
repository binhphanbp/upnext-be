import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApplicationStatus } from '@prisma/client';

export class OfferDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  salaryOffer!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  startDate!: string;

  @IsDateString()
  expiresAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Required when a recruiter sends an offer. `note` remains accepted for legacy clients. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OfferDetailsDto)
  offer?: OfferDetailsDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
