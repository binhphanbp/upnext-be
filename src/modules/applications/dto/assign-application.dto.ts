import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignApplicationDto {
  @IsUUID()
  recruiterAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UnassignApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
