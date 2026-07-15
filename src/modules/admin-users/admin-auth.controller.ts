import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminLoginResponse } from '../auth/entities/auth.entity';
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
}
