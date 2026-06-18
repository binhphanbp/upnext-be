import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
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
import { CompanyMembersService } from './company-members.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  CompanyMember,
  CompanyMemberInvitation,
  CompanyMemberInvitationStatus,
  CompanyMemberRoleUpdate,
} from './entities/company-member.entity';

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
  listMembers(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
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
  @Post('companies/:companyId/members/invite')
  inviteMember(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.companyMembersService.inviteMember(companyId, dto);
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
  acceptInvitation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companyMembersService.acceptInvitation(id);
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
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.companyMembersService.updateMemberRole(id, dto);
  }

  @ApiOperation({
    summary: 'Xóa thành viên khỏi công ty',
    description: 'Xóa thành viên khỏi công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member UUID' })
  @ApiNoContentResponse({ description: 'Member removed successfully' })
  @ApiNotFoundResponse({ description: 'Member not found' })
  @Delete('company-members/:id')
  @HttpCode(204)
  async removeMember(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.companyMembersService.removeMember(id);
  }
}
