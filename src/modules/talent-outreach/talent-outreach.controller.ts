import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTalentContactDto } from './dto/create-talent-contact.dto';
import { GenerateRecommendationsDto } from './dto/generate-recommendations.dto';
import { TalentContactActionDto } from './dto/talent-contact-action.dto';
import { UpdateContactPreferenceDto } from './dto/update-contact-preference.dto';
import { TalentContactService } from './talent-contact.service';
import { TalentRecommendationService } from './talent-recommendation.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TalentOutreachController {
  constructor(
    private readonly contacts: TalentContactService,
    private readonly recommendations: TalentRecommendationService,
  ) {}

  @Post('talent-recommendations/runs')
  @Roles(ActorType.RECRUITER)
  generate(@Body() dto: GenerateRecommendationsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.generate(dto, user);
  }

  @Get('talent-recommendations/runs/:id')
  @Roles(ActorType.RECRUITER)
  getRun(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.getRun(id, user);
  }

  @Post('talent-contact-requests')
  @Roles(ActorType.RECRUITER)
  create(@Body() dto: CreateTalentContactDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contacts.create(dto, user);
  }

  @Get('talent-contact-requests')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.contacts.list(user);
  }

  @Post('talent-contact-requests/:id/accept')
  @Roles(ActorType.CANDIDATE)
  accept(
    @Param('id') id: string,
    @Body() dto: TalentContactActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.accept(id, dto, user);
  }

  @Post('talent-contact-requests/:id/decline')
  @Roles(ActorType.CANDIDATE)
  decline(
    @Param('id') id: string,
    @Body() dto: TalentContactActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.decline(id, dto, user);
  }

  @Post('talent-contact-requests/:id/block-company')
  @Roles(ActorType.CANDIDATE)
  block(
    @Param('id') id: string,
    @Body() dto: TalentContactActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contacts.blockCompany(id, dto, user);
  }

  @Delete('candidate/contact-blocks/:companyId')
  @Roles(ActorType.CANDIDATE)
  unblock(@Param('companyId') companyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contacts.unblockCompany(companyId, user);
  }

  @Patch('candidate/contact-preference')
  @Roles(ActorType.CANDIDATE)
  preference(@Body() dto: UpdateContactPreferenceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contacts.updatePreference(dto, user);
  }
}
