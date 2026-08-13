import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
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
import { CandidateAccountAuthService } from './candidate-account-auth.service';

@ApiTags('Candidate - Account')
@UseGuards(ThrottlerGuard)
@Controller('candidate-accounts/password-reset')
export class CandidateAccountPasswordResetController {
  constructor(private readonly candidateAccountAuthService: CandidateAccountAuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('request')
  @ApiOperation({ summary: 'Gửi link đặt lại mật khẩu ứng viên' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiOkResponse({
    description: 'Đã xử lý yêu cầu đặt lại mật khẩu',
    type: PasswordResetRequestResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Headers('x-locale') locale?: string) {
    return this.candidateAccountAuthService.requestPasswordReset(dto, locale);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('confirm')
  @ApiOperation({ summary: 'Đặt lại mật khẩu ứng viên bằng token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    description: 'Đặt lại mật khẩu thành công',
    type: PasswordResetResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.candidateAccountAuthService.resetPassword(dto);
  }
}
