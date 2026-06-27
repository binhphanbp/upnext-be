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
import { CandidateAccountAuthService } from './candidate-account-auth.service';
import { VerifyCandidateEmailDto } from './dto/verify-candidate-email.dto';
import {
  CandidateEmailVerificationRequest,
  CandidateEmailVerificationResult,
} from './entities/email-verification.entity';

@ApiTags('Candidate - Account')
@Controller('candidate-accounts/email-verification')
export class CandidateAccountEmailVerificationController {
  constructor(private readonly candidateAccountAuthService: CandidateAccountAuthService) {}

  @Post('request')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Gửi link xác thực email ứng viên' })
  @ApiOkResponse({
    description: 'Đã gửi link xác thực email nếu email chưa được xác thực',
    type: CandidateEmailVerificationRequest,
  })
  @ApiUnauthorizedResponse({ description: 'Thiếu hoặc token không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Chỉ ứng viên mới có thể gọi endpoint này' })
  requestEmailVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateAccountAuthService.requestEmailVerification(user.id);
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Xác thực email ứng viên bằng token' })
  @ApiBody({ type: VerifyCandidateEmailDto })
  @ApiOkResponse({
    description: 'Xác thực email thành công',
    type: CandidateEmailVerificationResult,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Token xác thực email không hợp lệ hoặc đã hết hạn' })
  verifyEmail(@Body() dto: VerifyCandidateEmailDto) {
    return this.candidateAccountAuthService.verifyEmail(dto);
  }
}
