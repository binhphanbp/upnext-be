import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionFeature } from '../../subscriptions/feature-registry';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlanFeatureInputDto {
  @ApiProperty({ enum: SubscriptionFeature })
  @IsEnum(SubscriptionFeature)
  feature: SubscriptionFeature;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Hạn mức trong một chu kỳ. Bỏ trống hoặc null = không giới hạn.',
    example: 10,
    nullable: true,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  limitValue?: number | null;
}

export class SetPlanFeaturesDto {
  @ApiProperty({ type: [PlanFeatureInputDto] })
  @IsArray()
  @ArrayMaxSize(Object.keys(SubscriptionFeature).length)
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureInputDto)
  features: PlanFeatureInputDto[];
}
