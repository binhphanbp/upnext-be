import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  AdminStatus,
  CompanyStatus,
  CompanyVerificationStatus,
  ConversationParticipantRole,
  ConversationStatus,
  ConversationType,
  MessageType,
  ModerationStatus,
  RoleStatus,
  SupportAssignmentAction,
  SupportCaseStatus,
  SupportDepartment,
  SupportPriority,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationRealtimeService } from '../conversations/services/conversation-realtime.service';
import { MessageService } from '../conversations/services/message.service';
import { OutboxService } from '../outbox/outbox.service';
import { CreateSupportCaseDto } from './dto/create-support-case.dto';
import {
  ChangeSupportCaseStatusDto,
  ClaimSupportCaseDto,
  TransferSupportCaseDto,
} from './dto/support-case-actions.dto';
import { SupportRoutingPolicy } from './support-routing.policy';

const transitions: Record<SupportCaseStatus, ReadonlySet<SupportCaseStatus>> = {
  [SupportCaseStatus.NEW]: new Set([SupportCaseStatus.IN_PROGRESS]),
  [SupportCaseStatus.IN_PROGRESS]: new Set([
    SupportCaseStatus.WAITING_ON_RECRUITER,
    SupportCaseStatus.WAITING_ON_SUPPORT,
    SupportCaseStatus.RESOLVED,
    SupportCaseStatus.CLOSED,
  ]),
  [SupportCaseStatus.WAITING_ON_RECRUITER]: new Set([
    SupportCaseStatus.WAITING_ON_SUPPORT,
    SupportCaseStatus.IN_PROGRESS,
    SupportCaseStatus.RESOLVED,
    SupportCaseStatus.CLOSED,
  ]),
  [SupportCaseStatus.WAITING_ON_SUPPORT]: new Set([
    SupportCaseStatus.IN_PROGRESS,
    SupportCaseStatus.WAITING_ON_RECRUITER,
    SupportCaseStatus.RESOLVED,
    SupportCaseStatus.CLOSED,
  ]),
  [SupportCaseStatus.RESOLVED]: new Set([
    SupportCaseStatus.WAITING_ON_SUPPORT,
    SupportCaseStatus.CLOSED,
  ]),
  [SupportCaseStatus.CLOSED]: new Set([SupportCaseStatus.WAITING_ON_SUPPORT]),
};

@Injectable()
export class SupportCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: SupportRoutingPolicy,
    private readonly messages: MessageService,
    private readonly outbox: OutboxService,
    private readonly realtime: ConversationRealtimeService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateSupportCaseDto, user: AuthenticatedUser) {
    this.assertEnabled();
    if (user.role !== ActorType.RECRUITER || !user.companyId) {
      throw new ForbiddenException('Recruiter company access required');
    }
    const duplicate = await this.prisma.supportCase.findUnique({
      where: {
        companyId_createdByRecruiterId_clientRequestId: {
          companyId: user.companyId,
          createdByRecruiterId: user.id,
          clientRequestId: dto.clientRequestId,
        },
      },
    });
    if (duplicate) return { data: duplicate };

    const department = this.routing.departmentFor(dto.categoryCode);
    await this.routing.validateContext(user.companyId, department, dto);
    if (department === SupportDepartment.JOB_REVIEW && dto.jobPostId) {
      const active = await this.prisma.supportCase.findFirst({
        where: {
          jobPostId: dto.jobPostId,
          department,
          status: { not: SupportCaseStatus.CLOSED },
        },
      });
      if (active) throw new ConflictException('An active job review support case already exists');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.SUPPORT,
          status: ConversationStatus.ACTIVE,
          companyId: user.companyId,
          jobPostId: dto.jobPostId,
          createdByActorType: ActorType.RECRUITER,
          createdByActorId: user.id,
        },
      });
      const participant = await tx.conversationParticipant.create({
        data: {
          conversationId: conversation.id,
          recruiterAccountId: user.id,
          role: ConversationParticipantRole.RECRUITER,
        },
      });
      const supportCase = await tx.supportCase.create({
        data: {
          caseNumber: caseNumber(),
          clientRequestId: dto.clientRequestId,
          conversationId: conversation.id,
          companyId: user.companyId!,
          createdByRecruiterId: user.id,
          jobPostId: dto.jobPostId,
          invoiceId: dto.invoiceId,
          companySubscriptionId: dto.companySubscriptionId,
          department,
          categoryCode: dto.categoryCode,
          priority: dto.priority ?? SupportPriority.NORMAL,
          title: dto.title.trim(),
          description: dto.description.trim(),
          lastRequesterMessageAt: new Date(),
        },
      });
      await tx.supportCaseStatusHistory.create({
        data: {
          caseId: supportCase.id,
          toStatus: SupportCaseStatus.NEW,
          actorType: ActorType.RECRUITER,
          actorId: user.id,
          reason: 'Support case created',
        },
      });
      const initialMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderParticipantId: participant.id,
          clientMessageId: dto.clientRequestId,
          type: MessageType.TEXT,
          content: dto.description.trim(),
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          latestMessageId: initialMessage.id,
          latestMessageAt: initialMessage.createdAt,
          version: { increment: 1 },
        },
      });

      const recipients = await tx.adminUser.findMany({
        where: {
          status: AdminStatus.ACTIVE,
          role: {
            status: RoleStatus.ACTIVE,
            rolePermissions: {
              some: {
                permission: {
                  permissionCode: {
                    in: [this.routing.permissionFor(department), 'support:view_all'],
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      for (const recipient of recipients) {
        await this.outbox.enqueue(
          {
            aggregateType: 'support_case',
            aggregateId: supportCase.id,
            eventType: 'notification.create',
            dedupeKey: `support:${supportCase.id}:created:admin:${recipient.id}`,
            payload: {
              recipientId: recipient.id,
              recipientType: ActorType.ADMIN,
              title: `Yêu cầu hỗ trợ ${supportCase.caseNumber}`,
              body: supportCase.title,
              targetId: supportCase.id,
              targetType: 'SUPPORT_CASE',
            },
          },
          tx,
        );
      }
      return supportCase;
    });
    this.emitUpdate(result, 'created');
    return { data: result };
  }

  async listRecruiter(user: AuthenticatedUser) {
    this.assertEnabled();
    if (user.role !== ActorType.RECRUITER || !user.companyId) {
      throw new ForbiddenException('Recruiter company access required');
    }
    return {
      data: await this.prisma.supportCase.findMany({
        where: { companyId: user.companyId, createdByRecruiterId: user.id },
        orderBy: { updatedAt: 'desc' },
        include: supportCaseInclude,
      }),
    };
  }

  async listEligibleJobPosts(user: AuthenticatedUser) {
    this.assertEnabled();
    if (user.role !== ActorType.RECRUITER || !user.companyId) {
      throw new ForbiddenException('Recruiter company access required');
    }

    return {
      data: await this.prisma.jobPost.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          moderationStatus: {
            in: [ModerationStatus.PENDING, ModerationStatus.REJECTED],
          },
        },
        select: {
          id: true,
          title: true,
          moderationStatus: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async listCreationOptions(user: AuthenticatedUser) {
    this.assertEnabled();
    if (user.role !== ActorType.RECRUITER || !user.companyId) {
      throw new ForbiddenException('Recruiter company access required');
    }

    const [jobPosts, invoices, company] = await Promise.all([
      this.prisma.jobPost.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          moderationStatus: {
            in: [ModerationStatus.PENDING, ModerationStatus.REJECTED],
          },
        },
        select: {
          id: true,
          title: true,
          moderationStatus: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { companyId: user.companyId },
        select: {
          id: true,
          invoiceCode: true,
          amount: true,
          paymentStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.findUniqueOrThrow({
        where: { id: user.companyId },
        select: {
          id: true,
          name: true,
          status: true,
          verificationStatus: true,
        },
      }),
    ]);
    const eligibleForVerificationSupport =
      company.status === CompanyStatus.LOCKED ||
      company.verificationStatus === CompanyVerificationStatus.PENDING ||
      company.verificationStatus === CompanyVerificationStatus.REJECTED;

    return {
      data: {
        jobPosts,
        invoices,
        company: { ...company, eligibleForVerificationSupport },
      },
    };
  }

  async listAdmin(user: AuthenticatedUser) {
    this.assertEnabled();
    if (user.role !== ActorType.ADMIN) throw new ForbiddenException('Admin access required');
    const departments = Object.values(SupportDepartment).filter(
      (department) =>
        user.permissions.includes(this.routing.permissionFor(department)) ||
        user.permissions.includes('support:view_all'),
    );
    if (!departments.length) throw new ForbiddenException('Support permission required');
    return {
      data: await this.prisma.supportCase.findMany({
        where: { department: { in: departments } },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        include: supportCaseInclude,
      }),
    };
  }

  async detail(id: string, user: AuthenticatedUser) {
    this.assertEnabled();
    const supportCase = await this.prisma.supportCase.findUnique({
      where: { id },
      include: {
        ...supportCaseInclude,
        assignmentHistory: { orderBy: { createdAt: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!supportCase) throw new NotFoundException('Support case not found');
    if (user.role === ActorType.RECRUITER) {
      if (
        supportCase.companyId !== user.companyId ||
        supportCase.createdByRecruiterId !== user.id
      ) {
        throw new ForbiddenException('Support case is outside your scope');
      }
    } else {
      this.routing.assertAdminAccess(user, supportCase.department);
    }
    return { data: supportCase };
  }

  async listEligibleAssignees(id: string, user: AuthenticatedUser) {
    this.assertEnabled();
    const supportCase = await this.caseForAdmin(id, user, 'support:transfer');
    if (!supportCase.assignedAdminUserId) throw new ConflictException('Case is not assigned');
    this.assertAssignedOrViewAll(supportCase.assignedAdminUserId, user);
    const permissionCodes = [
      this.routing.permissionFor(supportCase.department),
      'support:view_all',
    ];

    return {
      data: await this.prisma.adminUser.findMany({
        where: {
          id: { not: supportCase.assignedAdminUserId },
          status: AdminStatus.ACTIVE,
          role: {
            status: RoleStatus.ACTIVE,
            rolePermissions: {
              some: {
                permission: { permissionCode: { in: permissionCodes } },
              },
            },
          },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: { select: { roleName: true } },
        },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
    };
  }

  async claim(id: string, dto: ClaimSupportCaseDto, user: AuthenticatedUser) {
    this.assertEnabled();
    const supportCase = await this.caseForAdmin(id, user, 'support:assign');
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supportCase.updateMany({
        where: { id, assignedAdminUserId: null, version: dto.expectedVersion },
        data: {
          assignedAdminUserId: user.id,
          status: SupportCaseStatus.IN_PROGRESS,
          version: { increment: 1 },
        },
      });
      if (!changed.count) {
        throw new ConflictException({
          code: 'CASE_ALREADY_ASSIGNED',
          message: 'Case was claimed by another admin',
        });
      }
      await tx.conversationParticipant.upsert({
        where: {
          conversationId_adminUserId: {
            conversationId: supportCase.conversationId,
            adminUserId: user.id,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: supportCase.conversationId,
          adminUserId: user.id,
          role: ConversationParticipantRole.ADMIN,
        },
      });
      await tx.supportCaseAssignmentHistory.create({
        data: {
          caseId: id,
          toAdminUserId: user.id,
          action: SupportAssignmentAction.CLAIM,
          performedByActorType: ActorType.ADMIN,
          performedByActorId: user.id,
        },
      });
      await tx.supportCaseStatusHistory.create({
        data: {
          caseId: id,
          fromStatus: supportCase.status,
          toStatus: SupportCaseStatus.IN_PROGRESS,
          actorType: ActorType.ADMIN,
          actorId: user.id,
          reason: 'Case claimed',
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: user.id,
          action: 'support.case.claim',
          targetId: id,
          targetType: 'support_case',
          oldValue: {
            status: supportCase.status,
            assignedAdminUserId: supportCase.assignedAdminUserId,
            version: supportCase.version,
          },
          newValue: {
            status: SupportCaseStatus.IN_PROGRESS,
            assignedAdminUserId: user.id,
            version: supportCase.version + 1,
          },
        },
      });
      await this.outbox.enqueue(
        {
          aggregateType: 'support_case',
          aggregateId: id,
          eventType: 'notification.create',
          dedupeKey: `support:${id}:claimed:version:${supportCase.version + 1}`,
          payload: {
            recipientId: supportCase.createdByRecruiterId,
            recipientType: ActorType.RECRUITER,
            title: `Yêu cầu ${supportCase.caseNumber} đã được tiếp nhận`,
            body: 'Bộ phận hỗ trợ đã nhận xử lý yêu cầu của bạn.',
            targetId: id,
            targetType: 'SUPPORT_CASE',
          },
        },
        tx,
      );
      await this.messages.createSystemMessage(
        tx,
        supportCase.conversationId,
        'SUPPORT_ASSIGNED',
        'Yêu cầu hỗ trợ đã được tiếp nhận.',
      );
      return tx.supportCase.findUniqueOrThrow({ where: { id } });
    });
    this.emitUpdate(result, 'claimed');
    return { data: result };
  }

  async transfer(id: string, dto: TransferSupportCaseDto, user: AuthenticatedUser) {
    this.assertEnabled();
    const supportCase = await this.caseForAdmin(id, user, 'support:transfer');
    if (!supportCase.assignedAdminUserId) throw new ConflictException('Case is not assigned');
    this.assertAssignedOrViewAll(supportCase.assignedAdminUserId, user);
    const permissionCodes = [
      this.routing.permissionFor(supportCase.department),
      'support:view_all',
    ];
    const target = await this.prisma.adminUser.findFirst({
      where: {
        id: dto.toAdminUserId,
        status: AdminStatus.ACTIVE,
        role: {
          status: RoleStatus.ACTIVE,
          rolePermissions: {
            some: {
              permission: { permissionCode: { in: permissionCodes } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Eligible destination admin not found');
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supportCase.updateMany({
        where: {
          id,
          version: dto.expectedVersion,
          assignedAdminUserId: supportCase.assignedAdminUserId,
        },
        data: { assignedAdminUserId: target.id, version: { increment: 1 } },
      });
      if (!changed.count) throw new ConflictException('Case changed; reload and retry');
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: supportCase.conversationId,
          adminUserId: supportCase.assignedAdminUserId,
        },
        data: { leftAt: new Date() },
      });
      await tx.conversationParticipant.upsert({
        where: {
          conversationId_adminUserId: {
            conversationId: supportCase.conversationId,
            adminUserId: target.id,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: supportCase.conversationId,
          adminUserId: target.id,
          role: ConversationParticipantRole.ADMIN,
        },
      });
      await tx.supportCaseAssignmentHistory.create({
        data: {
          caseId: id,
          fromAdminUserId: supportCase.assignedAdminUserId,
          toAdminUserId: target.id,
          action: SupportAssignmentAction.TRANSFER,
          performedByActorType: ActorType.ADMIN,
          performedByActorId: user.id,
          reason: dto.reason,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: user.id,
          action: 'support.case.transfer',
          targetId: id,
          targetType: 'support_case',
          oldValue: {
            assignedAdminUserId: supportCase.assignedAdminUserId,
            version: supportCase.version,
          },
          newValue: {
            assignedAdminUserId: target.id,
            version: supportCase.version + 1,
            reason: dto.reason,
          },
        },
      });
      await this.outbox.enqueue(
        {
          aggregateType: 'support_case',
          aggregateId: id,
          eventType: 'notification.create',
          dedupeKey: `support:${id}:transferred:version:${supportCase.version + 1}:admin:${target.id}`,
          payload: {
            recipientId: target.id,
            recipientType: ActorType.ADMIN,
            title: `Yêu cầu ${supportCase.caseNumber} được chuyển cho bạn`,
            body: supportCase.title,
            targetId: id,
            targetType: 'SUPPORT_CASE',
          },
        },
        tx,
      );
      await this.messages.createSystemMessage(
        tx,
        supportCase.conversationId,
        'SUPPORT_TRANSFERRED',
        'Yêu cầu hỗ trợ đã được chuyển người phụ trách.',
      );
      return tx.supportCase.findUniqueOrThrow({ where: { id } });
    });
    this.emitUpdate(result, 'transferred');
    return { data: result };
  }

  async changeStatus(id: string, dto: ChangeSupportCaseStatusDto, user: AuthenticatedUser) {
    this.assertEnabled();
    const supportCase = await this.caseForAdmin(id, user, actionPermission(dto.status));
    if (!supportCase.assignedAdminUserId) throw new ConflictException('Case is not assigned');
    this.assertAssignedOrViewAll(supportCase.assignedAdminUserId, user);
    if (!transitions[supportCase.status].has(dto.status)) {
      throw new ConflictException(
        `Cannot transition support case from ${supportCase.status} to ${dto.status}`,
      );
    }
    if (dto.status === SupportCaseStatus.RESOLVED && !dto.resolutionSummary) {
      throw new ConflictException('resolutionSummary is required when resolving a case');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supportCase.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          status: dto.status,
          resolutionCode: dto.resolutionCode,
          resolutionSummary: dto.resolutionSummary,
          resolvedAt: dto.status === SupportCaseStatus.RESOLVED ? new Date() : undefined,
          closedAt: dto.status === SupportCaseStatus.CLOSED ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new ConflictException('Case changed; reload and retry');
      await tx.supportCaseStatusHistory.create({
        data: {
          caseId: id,
          fromStatus: supportCase.status,
          toStatus: dto.status,
          actorType: ActorType.ADMIN,
          actorId: user.id,
          reason: dto.reason ?? dto.resolutionSummary,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: user.id,
          action: 'support.case.status_change',
          targetId: id,
          targetType: 'support_case',
          oldValue: {
            status: supportCase.status,
            version: supportCase.version,
          },
          newValue: {
            status: dto.status,
            version: supportCase.version + 1,
            reason: dto.reason,
            resolutionCode: dto.resolutionCode,
            resolutionSummary: dto.resolutionSummary,
          },
        },
      });
      await this.outbox.enqueue(
        {
          aggregateType: 'support_case',
          aggregateId: id,
          eventType: 'notification.create',
          dedupeKey: `support:${id}:status:${dto.status}:version:${supportCase.version + 1}`,
          payload: {
            recipientId: supportCase.createdByRecruiterId,
            recipientType: ActorType.RECRUITER,
            title: `Yêu cầu ${supportCase.caseNumber} đã cập nhật`,
            body: `Trạng thái hỗ trợ đã chuyển sang ${dto.status}.`,
            targetId: id,
            targetType: 'SUPPORT_CASE',
          },
        },
        tx,
      );
      await tx.conversation.update({
        where: { id: supportCase.conversationId },
        data: {
          status:
            dto.status === SupportCaseStatus.CLOSED || dto.status === SupportCaseStatus.RESOLVED
              ? ConversationStatus.READ_ONLY
              : ConversationStatus.ACTIVE,
          readOnlyAt:
            dto.status === SupportCaseStatus.CLOSED || dto.status === SupportCaseStatus.RESOLVED
              ? new Date()
              : null,
          version: { increment: 1 },
        },
      });
      await this.messages.createSystemMessage(
        tx,
        supportCase.conversationId,
        `SUPPORT_${dto.status}`,
        `Trạng thái hỗ trợ đã chuyển sang ${dto.status}.`,
      );
      return tx.supportCase.findUniqueOrThrow({ where: { id } });
    });
    this.emitUpdate(result, 'status_changed');
    return { data: result };
  }

  private async caseForAdmin(id: string, user: AuthenticatedUser, action?: string) {
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!supportCase) throw new NotFoundException('Support case not found');
    this.routing.assertAdminAccess(user, supportCase.department, action);
    return supportCase;
  }

  private assertAssignedOrViewAll(assignedAdminUserId: string, user: AuthenticatedUser) {
    if (assignedAdminUserId !== user.id && !user.permissions.includes('support:view_all')) {
      throw new ForbiddenException('Only the assigned admin can update this support case');
    }
  }

  private emitUpdate(
    supportCase: {
      id: string;
      department: SupportDepartment;
      createdByRecruiterId?: string;
      assignedAdminUserId?: string | null;
    },
    reason: string,
  ) {
    const payload = {
      schemaVersion: 1,
      caseSummary: supportCase,
      reason,
    };
    this.realtime.emitToSupportDepartment(supportCase.department.toLowerCase(), 'support:updated', {
      ...payload,
    });
    if (supportCase.createdByRecruiterId) {
      this.realtime.emitToUser(
        'recruiter',
        supportCase.createdByRecruiterId,
        'support:updated',
        payload,
      );
    }
    if (supportCase.assignedAdminUserId) {
      this.realtime.emitToUser(
        'admin',
        supportCase.assignedAdminUserId,
        'support:updated',
        payload,
      );
    }
  }

  private assertEnabled() {
    if (!this.config.get<boolean>('chatSupportEnabled')) {
      throw new ServiceUnavailableException('Support chat is not enabled');
    }
  }
}

const supportCaseInclude = {
  conversation: { select: { id: true, status: true, latestMessageAt: true } },
  assignedAdmin: { select: { id: true, fullName: true, avatarUrl: true } },
  jobPost: { select: { id: true, title: true, moderationStatus: true } },
  invoice: { select: { id: true, invoiceCode: true, paymentStatus: true, amount: true } },
  companySubscription: {
    select: { id: true, status: true, startedAt: true, expiredAt: true },
  },
} as const;

function caseNumber() {
  return `SUP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function actionPermission(status: SupportCaseStatus) {
  if (status === SupportCaseStatus.RESOLVED) return 'support:resolve';
  if (status === SupportCaseStatus.CLOSED) return 'support:close';
  if (status === SupportCaseStatus.WAITING_ON_SUPPORT) return 'support:reopen';
  return undefined;
}
