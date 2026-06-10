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
import { CreateRecruiterPermissionDto } from './dto/create-recruiter-permission.dto';
import { UpdateRecruiterPermissionDto } from './dto/update-recruiter-permission.dto';
import { RecruiterRolesService } from './recruiter-roles.service';

@ApiTags('recruiter-permissions')
@Controller('recruiter-permissions')
export class RecruiterPermissionsController {
  constructor(private readonly recruiterRolesService: RecruiterRolesService) {}

  @ApiOperation({ summary: 'List recruiter permissions', description: 'Lay danh sach tat ca quyen recruiter.' })
  @ApiOkResponse({
    description: 'Permissions fetched successfully',
    schema: {
      example: [
        { id: 'p1...', code: 'job_posts:create', module: 'job_posts', action: 'create', description: 'Allows creating new job posts' },
        { id: 'p2...', code: 'job_posts:read', module: 'job_posts', action: 'read', description: null },
      ],
    },
  })
  @Get()
  findAll() {
    return this.recruiterRolesService.findAllPermissions();
  }

  @ApiOperation({ summary: 'Get recruiter permission detail', description: 'Xem chi tiet mot quyen theo id.' })
  @ApiParam({ name: 'id', description: 'Recruiter permission UUID' })
  @ApiOkResponse({ description: 'Permission fetched successfully' })
  @ApiNotFoundResponse({ description: 'Permission not found' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.recruiterRolesService.findOnePermission(id);
  }

  @ApiOperation({ summary: 'Create recruiter permission', description: 'Tao moi mot quyen recruiter.' })
  @ApiCreatedResponse({
    description: 'Permission created successfully',
    schema: {
      example: {
        id: 'p1...',
        code: 'job_posts:create',
        module: 'job_posts',
        action: 'create',
        description: 'Allows creating new job posts',
        createdAt: '2026-06-09T08:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Permission with this code already exists' })
  @Post()
  create(@Body() dto: CreateRecruiterPermissionDto) {
    return this.recruiterRolesService.createPermission(dto);
  }

  @ApiOperation({ summary: 'Update recruiter permission', description: 'Cap nhat thong tin quyen.' })
  @ApiParam({ name: 'id', description: 'Recruiter permission UUID' })
  @ApiOkResponse({ description: 'Permission updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Permission with this code already exists' })
  @ApiNotFoundResponse({ description: 'Permission not found' })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRecruiterPermissionDto,
  ) {
    return this.recruiterRolesService.updatePermission(id, dto);
  }

  @ApiOperation({ summary: 'Delete recruiter permission', description: 'Xoa mot quyen recruiter.' })
  @ApiParam({ name: 'id', description: 'Recruiter permission UUID' })
  @ApiNoContentResponse({ description: 'Permission deleted successfully' })
  @ApiNotFoundResponse({ description: 'Permission not found' })
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.recruiterRolesService.removePermission(id);
  }
}
