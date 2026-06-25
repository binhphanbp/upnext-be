import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyMemberStatus, ActorType } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class CompanyMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Members ─────────────────────────────────────────────────────────────

  async listMembers(companyId: string) {
    await this.ensureCompanyExists(companyId);

    return this.prisma.companyMember.findMany({
      where: { companyId },
      orderBy: { joinedAt: 'asc' },
      include: {
        recruiterAccount: {
          select: {
            id: true,
            email: true,
            status: true,
            profile: { select: { fullName: true, avatarUrl: true } },
          },
        },
        role: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async inviteMember(companyId: string, dto: InviteMemberDto, currentUser: AuthenticatedUser) {
    // 1. Check if current user belongs to the company they are inviting to (or is an Admin)
    if (currentUser.role !== ActorType.ADMIN && currentUser.companyId !== companyId) {
      throw new ForbiddenException('You do not have permission to invite members to this company.');
    }

    // 2. Check if current user has OWNER or HR role in the company
    if (currentUser.role !== ActorType.ADMIN) {
      const invitingMember = await this.prisma.companyMember.findFirst({
        where: { recruiterAccountId: currentUser.id, companyId },
        include: { role: true },
      });
      if (!invitingMember || (invitingMember.role?.code !== 'OWNER' && invitingMember.role?.code !== 'HR')) {
        throw new ForbiddenException('You do not have permission to invite members.');
      }
    }

    const company = await this.ensureCompanyExists(companyId);
    const invitedEmail = dto.email.toLowerCase();

    const recruiterAccount = await this.prisma.recruiterAccount.findUnique({
      where: { email: invitedEmail },
      select: { id: true, email: true },
    });

    const existing = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        OR: [
          { invitedEmail },
          ...(recruiterAccount ? [{ recruiterAccountId: recruiterAccount.id }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException(
        `Email ${invitedEmail} is already invited or a member of this company`,
      );
    }

    if (dto.roleId) {
      const role = await this.prisma.recruiterRole.findUnique({
        where: { id: dto.roleId },
        select: { id: true, code: true },
      });

      if (!role) {
        throw new NotFoundException(`Recruiter role ${dto.roleId} not found`);
      }

      // Only 1 Owner is allowed per company
      if (role.code === 'OWNER') {
        const existingOwner = await this.prisma.companyMember.findFirst({
          where: {
            companyId,
            role: { code: 'OWNER' },
          },
        });
        if (existingOwner) {
          throw new ConflictException('Company already has an Owner. You cannot invite another Owner.');
        }
      }
    }

    const invitation = await this.prisma.companyMember.create({
      data: {
        recruiterAccountId: recruiterAccount?.id ?? null,
        invitedEmail,
        companyId,
        roleId: dto.roleId ?? null,
        status: CompanyMemberStatus.INVITED,
      },
      include: {
        recruiterAccount: {
          select: { id: true, email: true },
        },
        role: { select: { id: true, code: true, name: true } },
      },
    });

    await this.emailService.sendCompanyInvitation({
      to: invitation.invitedEmail ?? invitation.recruiterAccount?.email ?? invitedEmail,
      companyName: company.name,
      roleName: invitation.role?.name,
      invitationLink: this.buildInvitationLink(invitation.id),
    });

    return invitation;
  }

  async acceptInvitation(memberId: string, currentUser: AuthenticatedUser) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException(`Invitation ${memberId} not found`);
    }

    if (member.status !== CompanyMemberStatus.INVITED) {
      throw new ConflictException(`Invitation is not in INVITED status`);
    }

    // Verify current user matches invitation email or recruiterAccountId
    if (member.recruiterAccountId && member.recruiterAccountId !== currentUser.id) {
      throw new ForbiddenException('This invitation is not for your account.');
    }

    if (member.invitedEmail && member.invitedEmail.toLowerCase() !== currentUser.email.toLowerCase()) {
      throw new ForbiddenException('This invitation is not for your email address.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update companyMember status and recruiterAccountId
      const updatedMember = await tx.companyMember.update({
        where: { id: memberId },
        data: {
          status: CompanyMemberStatus.ACTIVE,
          recruiterAccountId: currentUser.id,
          joinedAt: new Date(),
        },
      });

      // 2. Link recruiterAccount to company and sync roleId
      await tx.recruiterAccount.update({
        where: { id: currentUser.id },
        data: {
          companyId: member.companyId,
          recruiterRoleId: member.roleId ?? undefined,
        },
      });

      return updatedMember;
    });
  }

  async updateMemberRole(memberId: string, dto: UpdateMemberRoleDto, currentUser: AuthenticatedUser) {
    const targetMember = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: { role: true },
    });

    if (!targetMember) {
      throw new NotFoundException(`Company member ${memberId} not found`);
    }

    // Verify role exists
    const targetRole = await this.prisma.recruiterRole.findUnique({
      where: { id: dto.roleId },
    });

    if (!targetRole) {
      throw new NotFoundException(`Recruiter role ${dto.roleId} not found`);
    }

    // Find current user member record in the target member's company
    const currentUserMember = await this.prisma.companyMember.findFirst({
      where: { recruiterAccountId: currentUser.id, companyId: targetMember.companyId },
      include: { role: true },
    });

    if (currentUser.role !== ActorType.ADMIN && !currentUserMember) {
      throw new ForbiddenException('You are not a member of this company.');
    }

    // ─── If target role is OWNER (Ownership Transfer) ──────────────────────
    if (targetRole.code === 'OWNER') {
      if (currentUser.role !== ActorType.ADMIN && currentUserMember?.role?.code !== 'OWNER') {
        throw new ForbiddenException('Only the company owner can transfer ownership.');
      }

      // If the target member is already owner, nothing to transfer
      if (targetMember.role?.code === 'OWNER') {
        return targetMember;
      }

      // Find the HR role to downgrade the previous owner to
      const hrRole = await this.prisma.recruiterRole.findFirst({
        where: { code: 'HR' },
      });

      if (!hrRole) {
        throw new NotFoundException('HR role not found to downgrade the previous owner.');
      }

      return this.prisma.$transaction(async (tx) => {
        // Find previous owner's recruiterAccountId
        const previousOwners = await tx.companyMember.findMany({
          where: {
            companyId: targetMember.companyId,
            role: { code: 'OWNER' },
          },
          select: { id: true, recruiterAccountId: true },
        });

        const previousOwnerAccountIds = previousOwners
          .map((o) => o.recruiterAccountId)
          .filter((id): id is string => Boolean(id));

        // 1. Downgrade previous owner(s) in this company to HR
        await tx.companyMember.updateMany({
          where: {
            companyId: targetMember.companyId,
            role: { code: 'OWNER' },
          },
          data: { roleId: hrRole.id },
        });

        if (previousOwnerAccountIds.length > 0) {
          await tx.recruiterAccount.updateMany({
            where: { id: { in: previousOwnerAccountIds } },
            data: { recruiterRoleId: hrRole.id },
          });
        }

        // 2. Upgrade target member to OWNER in CompanyMember
        const updated = await tx.companyMember.update({
          where: { id: memberId },
          data: { roleId: targetRole.id },
          include: {
            role: { select: { id: true, code: true, name: true } },
          },
        });

        // 3. Upgrade target member in RecruiterAccount
        if (targetMember.recruiterAccountId) {
          await tx.recruiterAccount.update({
            where: { id: targetMember.recruiterAccountId },
            data: { recruiterRoleId: targetRole.id },
          });
        }

        return updated;
      });
    }

    // ─── If target role is NOT OWNER ────────────────────────────────────────
    // 1. Cannot demote the OWNER directly without transferring ownership
    if (targetMember.role?.code === 'OWNER') {
      throw new ForbiddenException('Cannot demote the company Owner. Ownership must be transferred to another member first.');
    }

    // 2. Check if current user has permission (must be OWNER or HR in the company)
    if (currentUser.role !== ActorType.ADMIN) {
      if (!currentUserMember || (currentUserMember.role?.code !== 'OWNER' && currentUserMember.role?.code !== 'HR')) {
        throw new ForbiddenException('You do not have permission to manage member roles.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyMember.update({
        where: { id: memberId },
        data: { roleId: dto.roleId },
        include: {
          role: { select: { id: true, code: true, name: true } },
        },
      });

      if (targetMember.recruiterAccountId) {
        await tx.recruiterAccount.update({
          where: { id: targetMember.recruiterAccountId },
          data: { recruiterRoleId: dto.roleId },
        });
      }

      return updated;
    });
  }

  async removeMember(memberId: string, currentUser: AuthenticatedUser) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: { role: true },
    });

    if (!member) {
      throw new NotFoundException(`Company member ${memberId} not found`);
    }

    // 1. Cannot remove the owner of the company
    if (member.role?.code === 'OWNER') {
      throw new ForbiddenException('Cannot remove the company Owner. Ownership must be transferred first.');
    }

    // 2. Check permission to remove member (must be OWNER or HR)
    if (currentUser.role !== ActorType.ADMIN) {
      const currentUserMember = await this.prisma.companyMember.findFirst({
        where: { recruiterAccountId: currentUser.id, companyId: member.companyId },
        include: { role: true },
      });

      if (!currentUserMember || (currentUserMember.role?.code !== 'OWNER' && currentUserMember.role?.code !== 'HR')) {
        throw new ForbiddenException('You do not have permission to remove company members.');
      }

      // HR cannot remove another HR member
      if (currentUserMember.role?.code === 'HR' && member.role?.code === 'HR') {
        throw new ForbiddenException('HR members cannot remove other HR members.');
      }
    }

    await this.prisma.companyMember.delete({ where: { id: memberId } });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureCompanyExists(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return company;
  }

  private async ensureMemberExists(id: string) {
    const member = await this.prisma.companyMember.findUnique({ where: { id } });
    if (!member) {
      throw new NotFoundException(`Company member ${id} not found`);
    }
    return member;
  }

  private buildInvitationLink(invitationId: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    const url = new URL(`/recruiter/company-invitations/${invitationId}`, frontendUrl);
    return url.toString();
  }
}
