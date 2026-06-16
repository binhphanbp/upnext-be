import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider, AccountStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCandidateAccountDto {
  @ApiProperty({ example: 'Phan Van A', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'aphan@gmail.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ minLength: 8, maxLength: 72, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({ enum: AuthProvider, default: AuthProvider.DEFAULT })
  @IsOptional()
  @IsEnum(AuthProvider)
  authProvider?: AuthProvider;

  @ApiPropertyOptional({ example: 'google-oauth2|1234567890', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerUserId?: string;

  @ApiPropertyOptional({ enum: AccountStatus, default: AccountStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AccountStatus)
  candidateAccountStatus?: AccountStatus;
}
