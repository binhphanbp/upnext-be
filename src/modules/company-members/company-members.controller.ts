import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyMembersService } from './company-members.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  CompanyMember,
  CompanyMemberInvitation,
  CompanyMemberInvitationStatus,
  CompanyMemberRoleUpdate,
} from './entities/company-member.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType } from '@prisma/client';

@ApiTags('Company - Members')
@Controller()
export class CompanyMembersController {
  constructor(private readonly companyMembersService: CompanyMembersService) {}

  // ─── Scoped under /companies/:companyId ──────────────────────────────────

  @ApiOperation({
    summary: 'Danh sách thành viên công ty',
    description: 'Xem danh sách thành viên của một công ty.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Company members fetched successfully',
    type: [CompanyMember],
  })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Get('companies/:companyId/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  listMembers(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role !== ActorType.ADMIN && user.companyId !== companyId) {
      throw new ForbiddenException("You do not have access to this company's members.");
    }
    return this.companyMembersService.listMembers(companyId);
  }

  @ApiOperation({
    summary: 'Mời thành viên vào công ty',
    description: 'Mời recruiter vào công ty bằng email.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiCreatedResponse({
    description: 'Invitation sent successfully',
    type: CompanyMemberInvitation,
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiConflictResponse({ description: 'Recruiter is already a member' })
  @ApiNotFoundResponse({ description: 'Company or recruiter account not found' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post('companies/:companyId/members/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  inviteMember(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyMembersService.inviteMember(companyId, dto, user);
  }

  // ─── Scoped under /company-members ───────────────────────────────────────

  @ApiOperation({
    summary: 'Chấp nhận lời mời vào công ty',
    description: 'Recruiter chấp nhận lời mời tham gia công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member (invitation) UUID' })
  @ApiOkResponse({
    description: 'Invitation accepted successfully',
    type: CompanyMemberInvitationStatus,
  })
  @ApiConflictResponse({ description: 'Invitation is not in INVITED status' })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @Post('company-members/invitations/:id/accept')
  @UseGuards(JwtAuthGuard)
  acceptInvitation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyMembersService.acceptInvitation(id, user);
  }

  @ApiOperation({
    summary: 'Cập nhật vai trò thành viên',
    description: 'Đổi vai trò của thành viên trong công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member UUID' })
  @ApiOkResponse({
    description: 'Member role updated successfully',
    type: CompanyMemberRoleUpdate,
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiNotFoundResponse({ description: 'Member or role not found' })
  @Patch('company-members/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyMembersService.updateMemberRole(id, dto, user);
  }

  @ApiOperation({
    summary: 'Xóa thành viên khỏi công ty',
    description: 'Xóa thành viên khỏi công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member UUID' })
  @ApiNoContentResponse({ description: 'Member removed successfully' })
  @ApiNotFoundResponse({ description: 'Member not found' })
  @Delete('company-members/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @HttpCode(204)
  async removeMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.companyMembersService.removeMember(id, user);
  }
}
