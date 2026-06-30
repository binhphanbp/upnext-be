import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminLoginResponse } from '../auth/entities/auth.entity';
import { AdminAuthService } from './admin-auth.service';

@ApiTags('Admin - Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Đăng nhập tài khoản Admin',
    description:
      'Tài khoản test mặc định:\n' +
      '- Email: `admin.super@upnext.dev` (hoặc `admin.moderator@upnext.dev`, `admin.compliance@upnext.dev`, `admin.finance@upnext.dev`, `admin.support@upnext.dev`)\n' +
      '- Mật khẩu: `Password123!`',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Đăng nhập thành công', type: AdminLoginResponse })
  @ApiBadRequestResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
  login(@Body() dto: LoginDto) {
    return this.adminAuthService.login(dto);
  }
}
