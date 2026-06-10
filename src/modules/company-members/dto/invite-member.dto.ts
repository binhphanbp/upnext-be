import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'recruiter@company.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'b11eaeff-087f-4677-b8bd-c29ac7e59693' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
