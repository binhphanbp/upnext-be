import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class CurrentAuthController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentIdentity(@CurrentUser() user: AuthenticatedUser) {
    return { data: user };
  }
}
