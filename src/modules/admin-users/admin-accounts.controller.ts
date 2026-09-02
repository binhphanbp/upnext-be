import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAccountQueryDto } from './dto/admin-account-query.dto';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { ResetAdminPasswordDto } from './dto/reset-admin-password.dto';
import { UpdateAdminAccountDto } from './dto/update-admin-account.dto';

@ApiTags('Admin - Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/admins')
export class AdminAccountsController {
  constructor(private readonly adminAccountsService: AdminAccountsService) {}

  @ApiOperation({
    summary: 'Danh sách tài khoản Admin',
    description: 'Lấy danh sách các tài khoản quản trị viên kèm thông tin vai trò, hỗ trợ tìm kiếm và phân trang.',
  })
  @ApiOkResponse({ description: 'Lấy danh sách tài khoản admin thành công.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:read')
  @Get()
  findAll(@Query() query: AdminAccountQueryDto) {
    return this.adminAccountsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Chi tiết tài khoản Admin',
    description: 'Lấy chi tiết một tài khoản quản trị viên theo UUID.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiOkResponse({ description: 'Lấy chi tiết tài khoản admin thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:read')
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminAccountsService.findOne(id);
  }

  @ApiOperation({
    summary: 'Tạo tài khoản Admin mới',
    description: 'Tạo tài khoản quản trị viên mới với mật khẩu và phân vai trò.',
  })
  @ApiCreatedResponse({ description: 'Tạo tài khoản admin thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu đầu vào không hợp lệ.' })
  @ApiConflictResponse({ description: 'Email đã được sử dụng.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @Post()
  create(@Body() dto: CreateAdminAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adminAccountsService.create(user.id, dto);
  }

  @ApiOperation({
    summary: 'Cập nhật tài khoản Admin',
    description: 'Cập nhật thông tin, thay đổi vai trò hoặc trạng thái của tài khoản Admin.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiOkResponse({ description: 'Cập nhật tài khoản admin thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiConflictResponse({ description: 'Email đã tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminAccountsService.update(id, user.id, dto);
  }

  @ApiOperation({
    summary: 'Đặt lại mật khẩu tài khoản Admin',
    description: 'Đặt lại mật khẩu cho tài khoản Admin và vô hiệu hóa tất cả phiên đăng nhập cũ.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiOkResponse({ description: 'Đặt lại mật khẩu thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @Post(':id/reset-password')
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetAdminPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminAccountsService.resetPassword(id, user.id, dto);
  }

  @ApiOperation({
    summary: 'Khóa tài khoản Admin',
    description: 'Khóa tài khoản Admin và lập tức thu hồi toàn bộ session đăng nhập.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiOkResponse({ description: 'Khóa tài khoản thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @Post(':id/lock')
  lock(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminAccountsService.lock(id, user.id);
  }

  @ApiOperation({
    summary: 'Mở khóa tài khoản Admin',
    description: 'Mở khóa chuyển trạng thái tài khoản Admin sang ACTIVE.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiOkResponse({ description: 'Mở khóa tài khoản thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @Post(':id/unlock')
  unlock(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminAccountsService.unlock(id, user.id);
  }

  @ApiOperation({
    summary: 'Xóa hoặc Lưu trữ tài khoản Admin',
    description: 'Lưu trữ tài khoản Admin (soft delete) và thu hồi quyền đăng nhập.',
  })
  @ApiParam({ name: 'id', description: 'UUID của tài khoản Admin' })
  @ApiNoContentResponse({ description: 'Lưu trữ tài khoản admin thành công.' })
  @ApiNotFoundResponse({ description: 'Tài khoản admin không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Không có quyền thực hiện hành động này.' })
  @AdminPermissions('admins:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminAccountsService.remove(id, user.id);
  }
}
