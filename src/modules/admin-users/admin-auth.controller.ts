import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminLoginResponse } from '../auth/entities/auth.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAuthService } from './admin-auth.service';

@ApiTags('Admin - Auth')
@ApiExtraModels(LoginDto)
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Đăng nhập tài khoản Admin',
    description: 'Chọn một trong các tài khoản seed bên dưới để thử đăng nhập.',
  })
  @ApiBody({
    schema: { $ref: getSchemaPath(LoginDto) },
    examples: {
      superAdmin: {
        summary: 'Super Admin',
        value: { email: 'admin.super@upnext.dev', password: 'Password123!' },
      },
      moderator: {
        summary: 'Moderator',
        value: { email: 'admin.moderator@upnext.dev', password: 'Password123!' },
      },
      compliance: {
        summary: 'Compliance',
        value: { email: 'admin.compliance@upnext.dev', password: 'Password123!' },
      },
    },
  })
  @ApiOkResponse({ description: 'Đăng nhập thành công', type: AdminLoginResponse })
  @ApiBadRequestResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
  login(@Body() dto: LoginDto) {
    return this.adminAuthService.login(dto);
  }

  @ApiOperation({
    summary: 'Thông tin Admin hiện tại',
    description: 'Lấy thông tin tài khoản, vai trò và danh sách quyền hạn của Admin đang đăng nhập.',
  })
  @ApiOkResponse({ description: 'Lấy thông tin thành công.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuthService.getProfile(user.id);
  }
}
