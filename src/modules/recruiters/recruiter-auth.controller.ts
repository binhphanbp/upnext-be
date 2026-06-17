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
import { LoginDto } from '../auth/dto/login.dto';
import { LoginResponse } from '../auth/entities/auth.entity';
import { RecruiterAuthService } from './recruiter-auth.service';

@ApiTags('Recruiter - Auth')
@Controller('recruiter/auth')
export class RecruiterAuthController {
  constructor(private readonly recruiterAuthService: RecruiterAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Recruiter login and receive JWT access token' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful', type: LoginResponse })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc password không hợp lệ' })
  login(@Body() dto: LoginDto) {
    return this.recruiterAuthService.login(dto);
  }
}
