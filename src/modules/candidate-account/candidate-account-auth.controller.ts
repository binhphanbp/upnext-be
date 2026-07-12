import { Body, Controller, Post, Get, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from '../auth/guards/google-auth.guard';
import type { Response } from 'express';
@ApiTags('Candidate - Auth')
@Controller('candidate/auth')
export class CandidateAccountAuthController {
  constructor(
    private readonly candidateAccountAuthService: CandidateAccountAuthService,
    private readonly configService: ConfigService,
  ) {}

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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập tài khoản ứng viên' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Đăng nhập thành công', type: LoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Sai thông tin đăng nhập' })
  login(@Body() dto: LoginDto) {
    return this.candidateAccountAuthService.login(dto);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Khởi chạy luồng đăng nhập bằng Google (Redirect)' })
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Callback xử lý đăng nhập Google từ Backend và redirect về Frontend' })
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const googleUser = req.user as { providerUserId: string; email: string; fullName: string };
    const result = await this.candidateAccountAuthService.loginOrRegisterGoogle(googleUser);
    const { accessToken } = result;
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    return res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
  }
}
