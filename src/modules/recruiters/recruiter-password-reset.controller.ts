import { Body, Controller, Post, Headers, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { RequestPasswordResetDto } from '../auth/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import {
  PasswordResetRequestResponse,
  PasswordResetResponse,
} from '../auth/entities/password-reset.entity';
import { RecruiterAuthService } from './recruiter-auth.service';

@ApiTags('Recruiter - Account')
@UseGuards(ThrottlerGuard)
@Controller('recruiter-accounts/password-reset')
export class RecruiterPasswordResetController {
  constructor(private readonly recruiterAuthService: RecruiterAuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('request')
  @ApiOperation({ summary: 'Gửi link đặt lại mật khẩu recruiter' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiOkResponse({
    description: 'Đã xử lý yêu cầu đặt lại mật khẩu',
    type: PasswordResetRequestResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Headers('x-locale') locale?: string,
  ) {
    return this.recruiterAuthService.requestPasswordReset(dto, locale);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('confirm')
  @ApiOperation({ summary: 'Đặt lại mật khẩu recruiter bằng token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Đặt lại mật khẩu thành công',
    type: PasswordResetResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.recruiterAuthService.resetPassword(dto);
  }
}
