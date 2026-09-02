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
import { MagicLinkLoginDto } from './dto/magic-link-login.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { RecruiterLoginResponse, RecruiterRegisterResponse } from '../auth/entities/auth.entity';
import { RecruiterRefreshTokenDto } from './dto/recruiter-refresh-token.dto';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { RecruiterAuthService } from './recruiter-auth.service';
import { ConfigService } from '@nestjs/config';
import { RecruiterGoogleAuthGuard } from '../auth/guards/recruiter-google-auth.guard';
import type { Response } from 'express';

@ApiTags('Recruiter - Auth')
@Controller('recruiter/auth')
export class RecruiterAuthController {
  constructor(
    private readonly recruiterAuthService: RecruiterAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản nhà tuyển dụng' })
  @ApiBody({ type: RegisterRecruiterDto })
  @ApiCreatedResponse({
    description: 'Đăng ký thành công, cần xác thực email trước khi đăng nhập',
    type: RecruiterRegisterResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiConflictResponse({ description: 'Tài khoản nhà tuyển dụng đã tồn tại' })
  register(@Body() dto: RegisterRecruiterDto) {
    return this.recruiterAuthService.register(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập nhà tuyển dụng' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful', type: RecruiterLoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc password không hợp lệ' })
  login(@Body() dto: LoginDto) {
    return this.recruiterAuthService.login(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  // Chặt hơn login bằng mật khẩu: đây là đường vào không cần biết mật khẩu, chỉ cần
  // giữ được token, nên không có lý do gì để cho gọi nhiều.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('magic-link')
  @ApiOperation({
    summary: 'Đăng nhập bằng link trong email (nhà tuyển dụng)',
    description:
      'Đổi token trong link email thành session. Token hết hạn sau 30 phút và chỉ dùng được cho đúng tài khoản mà email được gửi tới.',
  })
  @ApiBody({ type: MagicLinkLoginDto })
  @ApiOkResponse({ description: 'Login successful', type: RecruiterLoginResponse })
  @ApiUnauthorizedResponse({ description: 'Token không hợp lệ hoặc đã hết hạn' })
  loginWithMagicLink(@Body() dto: MagicLinkLoginDto) {
    return this.recruiterAuthService.loginWithMagicLink(dto.token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Lam moi access token nha tuyen dung bang refresh token' })
  @ApiBody({ type: RecruiterRefreshTokenDto })
  @ApiOkResponse({ description: 'Refresh successful', type: RecruiterLoginResponse })
  @ApiBadRequestResponse({ description: 'Payload khong hop le' })
  @ApiUnauthorizedResponse({ description: 'Refresh token khong hop le hoac da het han' })
  refresh(@Body() dto: RecruiterRefreshTokenDto) {
    return this.recruiterAuthService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Dang xuat nha tuyen dung va revoke refresh token' })
  @ApiBody({ type: RecruiterRefreshTokenDto })
  @ApiOkResponse({ description: 'Logout successful' })
  @ApiBadRequestResponse({ description: 'Payload khong hop le' })
  logout(@Body() dto: RecruiterRefreshTokenDto) {
    return this.recruiterAuthService.logout(dto);
  }

  @Public()
  @Get('google')
  @UseGuards(RecruiterGoogleAuthGuard)
  @ApiOperation({ summary: 'Khởi chạy luồng đăng nhập bằng Google cho Recruiter (Redirect)' })
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(RecruiterGoogleAuthGuard)
  @ApiOperation({
    summary: 'Callback xử lý đăng nhập Google Recruiter từ Backend và redirect về Frontend',
  })
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const locale = req.query.state === 'en' ? 'en' : 'vi';
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const loginUrl = new URL(`/${locale}/recruiter/login`, frontendUrl);
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
      const result = await this.recruiterAuthService.loginOrRegisterGoogle(googleUser);
      const redirectUrl = new URL(`/${locale}/recruiter/auth/callback`, frontendUrl);
      redirectUrl.hash = new URLSearchParams({
        token: result.accessToken,
        refreshToken: result.refreshToken,
      }).toString();
      return res.redirect(redirectUrl.toString());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Đăng nhập thất bại';
      loginUrl.searchParams.set('error', message);
      return res.redirect(loginUrl.toString());
    }
  }
}
