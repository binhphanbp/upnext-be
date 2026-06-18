import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyMemberStatus } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

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

  async inviteMember(companyId: string, dto: InviteMemberDto) {
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
        select: { id: true },
      });

      if (!role) {
        throw new NotFoundException(`Recruiter role ${dto.roleId} not found`);
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

  async acceptInvitation(memberId: string) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException(`Invitation ${memberId} not found`);
    }

    if (member.status !== CompanyMemberStatus.INVITED) {
      throw new ConflictException(`Invitation is not in INVITED status`);
    }

    return this.prisma.companyMember.update({
      where: { id: memberId },
      data: { status: CompanyMemberStatus.ACTIVE },
    });
  }

  async updateMemberRole(memberId: string, dto: UpdateMemberRoleDto) {
    await this.ensureMemberExists(memberId);

    // Verify role exists
    const role = await this.prisma.recruiterRole.findUnique({
      where: { id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException(`Recruiter role ${dto.roleId} not found`);
    }

    return this.prisma.companyMember.update({
      where: { id: memberId },
      data: { roleId: dto.roleId },
      include: {
        role: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async removeMember(memberId: string) {
    await this.ensureMemberExists(memberId);
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
