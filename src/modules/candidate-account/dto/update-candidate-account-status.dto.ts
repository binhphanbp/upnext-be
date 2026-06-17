import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCandidateAccountStatusDto {
  @ApiProperty({ enum: AccountStatus, example: AccountStatus.BANNED })
  @IsEnum(AccountStatus)
  candidateAccountStatus: AccountStatus;
}
