import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ example: 'b11eaeff-087f-4677-b8bd-c29ac7e59693' })
  @IsUUID()
  roleId!: string;
}
