import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsUUID } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'recruiter@company.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb',
    description: 'Recruiter role UUID assigned to the invited member.',
  })
  @IsUUID()
  roleId!: string;
}
