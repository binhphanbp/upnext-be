import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { RecruiterLoginResponse } from '../auth/entities/auth.entity';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { RecruiterAuthService } from './recruiter-auth.service';

@ApiTags('Recruiter - Auth')
@Controller('recruiter/auth')
export class RecruiterAuthController {
  constructor(private readonly recruiterAuthService: RecruiterAuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản nhà tuyển dụng' })
  @ApiBody({ type: RegisterRecruiterDto })
  @ApiCreatedResponse({ description: 'Đăng ký thành công', type: RecruiterLoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiConflictResponse({ description: 'Tài khoản nhà tuyển dụng đã tồn tại' })
  register(@Body() dto: RegisterRecruiterDto) {
    return this.recruiterAuthService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập nhà tuyển dụng' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful', type: RecruiterLoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc password không hợp lệ' })
  login(@Body() dto: LoginDto) {
    return this.recruiterAuthService.login(dto);
  }
}
