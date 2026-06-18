import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'recruiter@company.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Existing recruiter role UUID. Omit to invite without a role.',
  })
  @IsOptional()
  @IsUUID()
  roleId?: string | null;
}
