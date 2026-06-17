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
import { RequestPasswordResetDto } from '../auth/dto/request-password-reset.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import {
  PasswordResetRequestResponse,
  PasswordResetResponse,
} from '../auth/entities/password-reset.entity';
import { CandidateAccountAuthService } from './candidate-account-auth.service';

@ApiTags('Candidate - Account')
@Controller('candidate-accounts/password-reset')
export class CandidateAccountPasswordResetController {
  constructor(private readonly candidateAccountAuthService: CandidateAccountAuthService) {}

  @Public()
  @Post('request')
  @ApiOperation({ summary: 'Gửi link đặt lại mật khẩu ứng viên' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiOkResponse({
    description: 'Đã xử lý yêu cầu đặt lại mật khẩu',
    type: PasswordResetRequestResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.candidateAccountAuthService.requestPasswordReset(dto);
  }

  @Public()
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
