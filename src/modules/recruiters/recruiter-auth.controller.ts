import { Body, Controller, Post, Get, Req, Res, UseGuards } from '@nestjs/common';
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
import { RecruiterRefreshTokenDto } from './dto/recruiter-refresh-token.dto';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { RecruiterAuthService } from './recruiter-auth.service';
import { ConfigService } from '@nestjs/config';
import { RecruiterGoogleAuthGuard } from '../auth/guards/recruiter-google-auth.guard';
import { Response } from 'express';

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

  @Public()
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
    try {
      const googleUser = req.user as { providerUserId: string; email: string; fullName: string };
      const result = await this.recruiterAuthService.loginOrRegisterGoogle(googleUser);
      const redirectUrl = new URL(`/${locale}/recruiter/auth/callback`, frontendUrl);
      redirectUrl.searchParams.set('token', result.accessToken);
      redirectUrl.searchParams.set('refreshToken', result.refreshToken);
      return res.redirect(redirectUrl.toString());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Đăng nhập thất bại';
      return res.redirect(
        `${frontendUrl}/${locale}/recruiter/login?error=${encodeURIComponent(message)}`,
      );
    }
  }
}
