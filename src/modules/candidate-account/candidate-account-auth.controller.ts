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
import { LoginResponse } from '../auth/entities/auth.entity';
import { CandidateAccountAuthService } from './candidate-account-auth.service';
import { RegisterCandidateDto } from './dto/register-candidate.dto';

@ApiTags('Candidate - Auth')
@Controller('candidate/auth')
export class CandidateAccountAuthController {
  constructor(private readonly candidateAccountAuthService: CandidateAccountAuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản ứng viên' })
  @ApiBody({ type: RegisterCandidateDto })
  @ApiCreatedResponse({ description: 'Đăng ký thành công', type: LoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiConflictResponse({ description: 'Tài khoản ứng viên đã tồn tại' })
  register(@Body() dto: RegisterCandidateDto) {
    return this.candidateAccountAuthService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập tài khoản ứng viên' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Đăng nhập thành công', type: LoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Sai thông tin đăng nhập' })
  login(@Body() dto: LoginDto) {
    return this.candidateAccountAuthService.login(dto);
  }
}
