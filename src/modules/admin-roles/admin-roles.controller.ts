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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { AdminRolesService } from './admin-roles.service';
import { AssignAdminPermissionsDto } from './dto/assign-admin-permissions.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@ApiTags('Admin - Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @ApiOperation({
    summary: 'Danh sách vai trò Admin',
    description: 'Lấy tất cả các vai trò Admin kèm danh sách các quyền tương ứng.',
  })
  @ApiOkResponse({ description: 'Lấy danh sách vai trò thành công.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:read')
  @Get()
  findAll() {
    return this.adminRolesService.findAllRoles();
  }

  @ApiOperation({
    summary: 'Chi tiết vai trò Admin',
    description: 'Lấy chi tiết thông tin một vai trò Admin theo UUID.',
  })
  @ApiParam({ name: 'id', description: 'UUID của vai trò Admin' })
  @ApiOkResponse({ description: 'Lấy chi tiết vai trò thành công.' })
  @ApiNotFoundResponse({ description: 'Vai trò không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:read')
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminRolesService.findOneRole(id);
  }

  @ApiOperation({
    summary: 'Tạo vai trò Admin mới',
    description: 'Tạo một vai trò mới cho admin hệ thống.',
  })
  @ApiCreatedResponse({ description: 'Tạo vai trò thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu đầu vào không hợp lệ.' })
  @ApiConflictResponse({ description: 'Tên vai trò đã tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:write')
  @Post()
  create(
    @Body() dto: CreateAdminRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminRolesService.createRole(user.id, dto);
  }

  @ApiOperation({
    summary: 'Cập nhật vai trò Admin',
    description: 'Cập nhật thông tin chi tiết một vai trò Admin.',
  })
  @ApiParam({ name: 'id', description: 'UUID của vai trò Admin' })
  @ApiOkResponse({ description: 'Cập nhật vai trò thành công.' })
  @ApiNotFoundResponse({ description: 'Vai trò không tồn tại.' })
  @ApiConflictResponse({ description: 'Tên vai trò đã tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:write')
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminRoleDto,
  ) {
    return this.adminRolesService.updateRole(id, dto);
  }

  @ApiOperation({
    summary: 'Xóa vai trò Admin',
    description: 'Xóa một vai trò Admin nếu không có admin nào đang sử dụng.',
  })
  @ApiParam({ name: 'id', description: 'UUID của vai trò Admin' })
  @ApiNoContentResponse({ description: 'Xóa vai trò thành công.' })
  @ApiConflictResponse({ description: 'Không thể xóa vì vai trò đang có admin sử dụng.' })
  @ApiNotFoundResponse({ description: 'Vai trò không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.adminRolesService.removeRole(id);
  }

  @ApiOperation({
    summary: 'Gán danh sách quyền cho vai trò Admin',
    description: 'Gán và đồng bộ danh sách các quyền (permissions) vào vai trò Admin chỉ định.',
  })
  @ApiParam({ name: 'id', description: 'UUID của vai trò Admin' })
  @ApiOkResponse({ description: 'Gán quyền thành công.' })
  @ApiNotFoundResponse({ description: 'Vai trò hoặc Quyền không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('roles:write')
  @Post(':id/permissions')
  assignPermissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignAdminPermissionsDto,
  ) {
    return this.adminRolesService.assignPermissions(id, dto);
  }
}
