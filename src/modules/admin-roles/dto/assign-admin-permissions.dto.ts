import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class AssignAdminPermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['perm-uuid-1', 'perm-uuid-2'],
    description: 'Danh sách các UUID của quyền admin để gán vào vai trò',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  permissionIds!: string[];
}
