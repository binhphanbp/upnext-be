import { Body, Controller, Post, Get, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
  @UseGuards(ThrottlerGuard)
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
    const locale = req.query.state === 'en' ? 'en' : 'vi';
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const loginUrl = new URL(`/${locale}/login`, frontendUrl);
    const googleOAuthError: unknown = req.googleOAuthError;

    if (googleOAuthError || !req.user) {
      loginUrl.searchParams.set(
        'error',
        typeof googleOAuthError === 'string'
          ? googleOAuthError
          : 'Đăng nhập Google thất bại. Vui lòng thử lại.',
      );
      return res.redirect(loginUrl.toString());
    }

    try {
      const googleUser = req.user as { providerUserId: string; email: string; fullName: string };
      const result = await this.candidateAccountAuthService.loginOrRegisterGoogle(googleUser);
      const redirectUrl = new URL(`/${locale}/candidate/auth/callback`, frontendUrl);
      redirectUrl.searchParams.set('token', result.accessToken);
      return res.redirect(redirectUrl.toString());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Đăng nhập Google thất bại';
      loginUrl.searchParams.set('error', message);
      return res.redirect(loginUrl.toString());
    }
  }
}
