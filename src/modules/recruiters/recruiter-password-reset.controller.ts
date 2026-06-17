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
import { RecruiterAuthService } from './recruiter-auth.service';

@ApiTags('Recruiter - Account')
@Controller('recruiter-accounts/password-reset')
export class RecruiterPasswordResetController {
  constructor(private readonly recruiterAuthService: RecruiterAuthService) {}

  @Public()
  @Post('request')
  @ApiOperation({ summary: 'Gửi link đặt lại mật khẩu recruiter' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiOkResponse({
    description: 'Đã xử lý yêu cầu đặt lại mật khẩu',
    type: PasswordResetRequestResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.recruiterAuthService.requestPasswordReset(dto);
  }

  @Public()
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
