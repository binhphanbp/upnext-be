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

@ApiTags('company-members')
@Controller()
export class CompanyMembersController {
  constructor(private readonly companyMembersService: CompanyMembersService) {}

  // ─── Scoped under /companies/:companyId ──────────────────────────────────

  @ApiOperation({
    summary: 'List company members',
    description: 'Xem danh sách thành viên của một công ty.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Company members fetched successfully',
    schema: {
      example: [
        {
          id: 'm1...',
          status: 'ACTIVE',
          joinedAt: '2026-06-09T08:00:00.000Z',
          recruiterAccount: {
            id: 'r1...',
            email: 'recruiter@company.com',
            status: 'ACTIVE',
            profile: { fullName: 'Nguyen Van A', avatarUrl: null },
          },
          role: { id: 'role1...', code: 'hr_manager', name: 'HR Manager' },
        },
      ],
    },
  })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Get('companies/:companyId/members')
  listMembers(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    return this.companyMembersService.listMembers(companyId);
  }

  @ApiOperation({
    summary: 'Invite company member',
    description: 'Mời recruiter vào công ty bằng email.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiCreatedResponse({
    description: 'Invitation sent successfully',
    schema: {
      example: {
        id: 'm1...',
        status: 'INVITED',
        joinedAt: '2026-06-09T08:00:00.000Z',
        recruiterAccount: { id: 'r1...', email: 'recruiter@company.com' },
        role: null,
      },
    },
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
    summary: 'Accept company invitation',
    description: 'Recruiter chấp nhận lời mời tham gia công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member (invitation) UUID' })
  @ApiOkResponse({
    description: 'Invitation accepted successfully',
    schema: {
      example: {
        id: 'm1...',
        status: 'ACTIVE',
        updatedAt: '2026-06-09T09:00:00.000Z',
      },
    },
  })
  @ApiConflictResponse({ description: 'Invitation is not in INVITED status' })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @Post('company-members/invitations/:id/accept')
  acceptInvitation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companyMembersService.acceptInvitation(id);
  }

  @ApiOperation({
    summary: 'Update member role',
    description: 'Đổi vai trò của thành viên trong công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company member UUID' })
  @ApiOkResponse({
    description: 'Member role updated successfully',
    schema: {
      example: {
        id: 'm1...',
        roleId: 'role1...',
        role: { id: 'role1...', code: 'hr_manager', name: 'HR Manager' },
      },
    },
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
    summary: 'Remove company member',
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
