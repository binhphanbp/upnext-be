import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvScreeningConfigService } from './cv-screening-config.service';
import { UpdateCvScreeningConfigDto } from './dto/update-cv-screening-config.dto';

@ApiTags('Recruiter - CV Screening Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/cv-screening/config')
export class CvScreeningConfigController {
  constructor(private readonly cvScreeningConfigService: CvScreeningConfigService) {}

  @Get()
  @ApiOperation({ summary: "Get the company's AI CV-screening configuration" })
  @ApiOkResponse({ description: 'Current configuration, or system defaults if unset.' })
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.cvScreeningConfigService.getConfig(user.id);
  }

  @Put()
  @ApiOperation({ summary: "Update the company's AI CV-screening configuration" })
  @ApiBody({ type: UpdateCvScreeningConfigDto })
  @ApiOkResponse({ description: 'Configuration saved.' })
  updateConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCvScreeningConfigDto) {
    return this.cvScreeningConfigService.updateConfig(user, dto);
  }
}
