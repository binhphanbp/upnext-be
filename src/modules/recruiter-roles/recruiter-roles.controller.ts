import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRecruiterRoleDto } from './dto/create-recruiter-role.dto';
import { UpdateRecruiterRoleDto } from './dto/update-recruiter-role.dto';
import { RecruiterRolesService } from './recruiter-roles.service';

@ApiTags('recruiter-roles')
@Controller('recruiter-roles')
export class RecruiterRolesController {
  constructor(private readonly recruiterRolesService: RecruiterRolesService) {}

  @ApiOperation({ summary: 'List recruiter roles', description: 'Lay danh sach tat ca role recruiter kem danh sach permission.' })
  @ApiOkResponse({
    description: 'Roles fetched successfully',
    schema: {
      example: [
        {
          id: 'role1...',
          code: 'hr_manager',
          name: 'HR Manager',
          description: 'Manages recruitment operations',
          rolePermissions: [
            { recruiterPermission: { id: 'p1...', code: 'job_posts:create', module: 'job_posts', action: 'create' } },
          ],
        },
      ],
    },
  })
  @Get()
  findAll() {
    return this.recruiterRolesService.findAllRoles();
  }

  @ApiOperation({ summary: 'Get recruiter role detail', description: 'Xem chi tiet mot role theo id.' })
  @ApiParam({ name: 'id', description: 'Recruiter role UUID' })
  @ApiOkResponse({ description: 'Role fetched successfully' })
  @ApiNotFoundResponse({ description: 'Role not found' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruiterRolesService.findOneRole(id);
  }

  @ApiOperation({ summary: 'Create recruiter role', description: 'Tao moi mot role cho recruiter.' })
  @ApiCreatedResponse({
    description: 'Role created successfully',
    schema: {
      example: {
        id: 'role1...',
        code: 'hr_manager',
        name: 'HR Manager',
        description: 'Manages recruitment operations',
        createdAt: '2026-06-09T08:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Role with this code already exists' })
  @Post()
  create(@Body() dto: CreateRecruiterRoleDto) {
    return this.recruiterRolesService.createRole(dto);
  }

  @ApiOperation({ summary: 'Update recruiter role', description: 'Cap nhat thong tin role.' })
  @ApiParam({ name: 'id', description: 'Recruiter role UUID' })
  @ApiOkResponse({ description: 'Role updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Role with this code already exists' })
  @ApiNotFoundResponse({ description: 'Role not found' })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecruiterRoleDto,
  ) {
    return this.recruiterRolesService.updateRole(id, dto);
  }

  @ApiOperation({ summary: 'Delete recruiter role', description: 'Xoa mot role recruiter.' })
  @ApiParam({ name: 'id', description: 'Recruiter role UUID' })
  @ApiNoContentResponse({ description: 'Role deleted successfully' })
  @ApiNotFoundResponse({ description: 'Role not found' })
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.recruiterRolesService.removeRole(id);
  }

  @ApiOperation({
    summary: 'Assign permissions to role',
    description: 'Gan danh sach permission vao mot role. Cac permission da ton tai se duoc bo qua.',
  })
  @ApiParam({ name: 'roleId', description: 'Recruiter role UUID' })
  @ApiOkResponse({
    description: 'Permissions assigned successfully - returns updated role with permissions',
    schema: {
      example: {
        id: 'role1...',
        code: 'hr_manager',
        name: 'HR Manager',
        rolePermissions: [
          { recruiterPermission: { id: 'p1...', code: 'job_posts:create', module: 'job_posts', action: 'create' } },
          { recruiterPermission: { id: 'p2...', code: 'job_posts:read', module: 'job_posts', action: 'read' } },
        ],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiNotFoundResponse({ description: 'Role or one of the permissions not found' })
  @Post(':roleId/permissions')
  assignPermissions(
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.recruiterRolesService.assignPermissions(roleId, dto);
  }
}
