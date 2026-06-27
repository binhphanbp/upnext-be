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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { AdminRolesService } from './admin-roles.service';
import { CreateAdminPermissionDto } from './dto/create-admin-permission.dto';
import { UpdateAdminPermissionDto } from './dto/update-admin-permission.dto';

@ApiTags('Admin - Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/permissions')
export class AdminPermissionsController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @ApiOperation({
    summary: 'Danh sách quyền Admin',
    description: 'Lấy tất cả các quyền hệ thống dành cho Admin.',
  })
  @ApiOkResponse({ description: 'Lấy danh sách quyền thành công.' })
  @AdminPermissions('permissions:read')
  @Get()
  findAll() {
    return this.adminRolesService.findAllPermissions();
  }

  @ApiOperation({
    summary: 'Chi tiết quyền Admin',
    description: 'Xem chi tiết thông tin một quyền Admin theo UUID.',
  })
  @ApiParam({ name: 'id', description: 'UUID của quyền Admin' })
  @ApiOkResponse({ description: 'Lấy chi tiết quyền thành công.' })
  @ApiNotFoundResponse({ description: 'Quyền không tồn tại.' })
  @AdminPermissions('permissions:read')
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminRolesService.findOnePermission(id);
  }

  @ApiOperation({
    summary: 'Tạo quyền Admin mới',
    description: 'Tạo một mã quyền Admin mới trong hệ thống.',
  })
  @ApiCreatedResponse({ description: 'Tạo quyền thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu đầu vào không hợp lệ.' })
  @ApiConflictResponse({ description: 'Mã quyền đã tồn tại.' })
  @AdminPermissions('permissions:write')
  @Post()
  create(@Body() dto: CreateAdminPermissionDto) {
    return this.adminRolesService.createPermission(dto);
  }

  @ApiOperation({
    summary: 'Cập nhật quyền Admin',
    description: 'Cập nhật thông tin chi tiết một quyền Admin.',
  })
  @ApiParam({ name: 'id', description: 'UUID của quyền Admin' })
  @ApiOkResponse({ description: 'Cập nhật quyền thành công.' })
  @ApiNotFoundResponse({ description: 'Quyền không tồn tại.' })
  @ApiConflictResponse({ description: 'Mã quyền đã tồn tại.' })
  @AdminPermissions('permissions:write')
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminPermissionDto,
  ) {
    return this.adminRolesService.updatePermission(id, dto);
  }

  @ApiOperation({
    summary: 'Xóa quyền Admin',
    description: 'Xóa một quyền Admin khỏi hệ thống.',
  })
  @ApiParam({ name: 'id', description: 'UUID của quyền Admin' })
  @ApiNoContentResponse({ description: 'Xóa quyền thành công.' })
  @ApiNotFoundResponse({ description: 'Quyền không tồn tại.' })
  @AdminPermissions('permissions:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.adminRolesService.removePermission(id);
  }
}
