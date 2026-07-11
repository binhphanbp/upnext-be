import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminLoginResponse } from '../auth/entities/auth.entity';
import { AdminAuthService } from './admin-auth.service';

@ApiTags('Admin - Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    @ApiOperation({
      summary: 'Đăng nhập tài khoản Admin',
    })
    @ApiBody({ type: LoginDto })
    @ApiOkResponse({ description: 'Đăng nhập thành công', type: AdminLoginResponse })
    @ApiBadRequestResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
    @ApiUnauthorizedResponse({ description: 'Email hoặc mật khẩu không hợp lệ' })
    login(@Body() dto: LoginDto) {
      return this.adminAuthService.login(dto);
    }
  }
