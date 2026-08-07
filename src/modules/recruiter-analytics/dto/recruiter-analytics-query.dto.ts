import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const RECRUITER_ANALYTICS_WINDOW_DAYS = [7, 30, 90] as const;
export type RecruiterAnalyticsWindowDays = (typeof RECRUITER_ANALYTICS_WINDOW_DAYS)[number];

export class RecruiterAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: RECRUITER_ANALYTICS_WINDOW_DAYS, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(RECRUITER_ANALYTICS_WINDOW_DAYS)
  windowDays: RecruiterAnalyticsWindowDays = 30;

  @ApiPropertyOptional({
    description:
      'Restrict analytics to a single job post owned by the caller. Omit to aggregate across all job posts the recruiter created.',
  })
  @IsOptional()
  @IsUUID()
  jobPostId?: string;
}
