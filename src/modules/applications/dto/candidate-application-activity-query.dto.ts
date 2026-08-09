import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const CANDIDATE_APPLICATION_ACTIVITY_GROUPS = [
  'all',
  'active',
  'interview',
  'action_required',
  'closed',
] as const;

export type CandidateApplicationActivityGroup =
  (typeof CANDIDATE_APPLICATION_ACTIVITY_GROUPS)[number];

export const CANDIDATE_APPLICATION_ACTIVITY_SORTS = [
  'recent_activity',
  'newest',
  'oldest',
] as const;

export type CandidateApplicationActivitySort =
  (typeof CANDIDATE_APPLICATION_ACTIVITY_SORTS)[number];

export class CandidateApplicationActivityQueryDto {
  @IsOptional()
  @IsIn(CANDIDATE_APPLICATION_ACTIVITY_GROUPS)
  group?: CandidateApplicationActivityGroup;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(CANDIDATE_APPLICATION_ACTIVITY_SORTS)
  sort?: CandidateApplicationActivitySort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
