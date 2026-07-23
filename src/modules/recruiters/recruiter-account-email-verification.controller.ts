import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RecruiterAuthService } from './recruiter-auth.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VerifyRecruiterEmailDto } from './dto/recruiter-accounts/verify-recruiter-email.dto';
import { RequestRecruiterEmailVerificationDto } from './dto/recruiter-accounts/request-email-verification.dto';
import {
  RecruiterEmailVerificationRequest,
  RecruiterEmailVerificationResult,
} from './entities/recruiter-email-verification.entity';

@ApiTags('Recruiter - Account')
@UseGuards(ThrottlerGuard)
@Controller('recruiter-accounts/email-verification')
export class RecruiterAccountEmailVerificationController {
  constructor(private readonly recruiterAuthService: RecruiterAuthService) {}

  @Post('request')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @ApiOperation({ summary: 'Gửi link xác thực email nhà tuyển dụng' })
  @ApiOkResponse({
    description: 'Đã gửi link xác thực email nếu email chưa được xác thực',
    type: RecruiterEmailVerificationRequest,
  })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Chỉ nhà tuyển dụng mới có thể gọi endpoint này' })
  requestEmailVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.recruiterAuthService.requestEmailVerification(user.id);
  }

  @Public()
  @Post('request-unauthenticated')
  @ApiOperation({
    summary: 'Gửi lại link xác thực email nhà tuyển dụng bằng địa chỉ email (chưa đăng nhập)',
  })
  @ApiBody({ type: RequestRecruiterEmailVerificationDto })
  @ApiOkResponse({
    description: 'Đã gửi link xác thực email nếu tài khoản tồn tại và chưa được xác thực',
    type: RecruiterEmailVerificationRequest,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  requestEmailVerificationUnauthenticated(@Body() dto: RequestRecruiterEmailVerificationDto) {
    return this.recruiterAuthService.requestEmailVerificationByEmail(dto.email);
  }

  @Public()
  @Post('status')
  @ApiOperation({
    summary: 'Kiá»ƒm tra tráº¡ng thÃ¡i xÃ¡c thá»±c email nhÃ  tuyá»ƒn dá»¥ng',
  })
  @ApiBody({ type: RequestRecruiterEmailVerificationDto })
  @ApiOkResponse({
    description: 'Tráº¡ng thÃ¡i xÃ¡c thá»±c email',
    type: RecruiterEmailVerificationRequest,
  })
  @ApiBadRequestResponse({ description: 'Payload khÃ´ng há»£p lá»‡' })
  getEmailVerificationStatus(@Body() dto: RequestRecruiterEmailVerificationDto) {
    return this.recruiterAuthService.getEmailVerificationStatusByEmail(dto.email);
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Xác thực email nhà tuyển dụng bằng token' })
  @ApiBody({ type: VerifyRecruiterEmailDto })
  @ApiOkResponse({
    description: 'Xác thực email thành công',
    type: RecruiterEmailVerificationResult,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Token xác thực email không hợp lệ hoặc đã hết hạn' })
  verifyEmail(@Body() dto: VerifyRecruiterEmailDto) {
    return this.recruiterAuthService.verifyEmail(dto);
  }
}
