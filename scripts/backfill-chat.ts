import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountStatus,
  ActorType,
  ApplicationStatus,
  ConversationParticipantRole,
  ConversationStatus,
  ConversationType,
  InterviewStatus,
  MessageType,
  PrismaClient,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const execute = process.argv.includes('--execute');

async function main() {
  const applications = await prisma.application.findMany({
    where: {
      OR: [
        {
          status: {
            in: [
              ApplicationStatus.INTERVIEWING,
              ApplicationStatus.OFFERED,
              ApplicationStatus.HIRED,
            ],
          },
        },
        {
          interviews: {
            some: { status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] } },
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      candidateProfile: { select: { candidateAccountId: true } },
      jobPost: { select: { id: true, companyId: true, createdByRecruiterId: true } },
      assignments: { where: { unassignedAt: null }, select: { recruiterAccountId: true } },
      statusLogs: {
        where: {
          actorType: ActorType.RECRUITER,
          actorId: { not: null },
          newStatus: {
            in: [
              ApplicationStatus.INTERVIEWING,
              ApplicationStatus.OFFERED,
              ApplicationStatus.HIRED,
            ],
          },
        },
        orderBy: { changedAt: 'desc' },
        take: 1,
        select: { actorId: true },
      },
      conversation: {
        select: {
          id: true,
          participants: {
            where: { recruiterAccountId: { not: null }, leftAt: null },
            select: { recruiterAccountId: true },
          },
        },
      },
    },
  });
  const profilesWithoutPreference = await prisma.candidateProfile.count({
    where: { contactPreference: null },
  });
  const transitionActorIds = applications
    .map((application) => application.statusLogs[0]?.actorId)
    .filter((actorId): actorId is string => Boolean(actorId));
  const transitionRecruiters = await prisma.recruiterAccount.findMany({
    where: { id: { in: transitionActorIds }, status: AccountStatus.ACTIVE },
    select: { id: true, companyId: true },
  });
  const transitionRecruiterCompanies = new Map(
    transitionRecruiters.map((recruiter) => [recruiter.id, recruiter.companyId]),
  );
  const transitionActorFor = (application: (typeof applications)[number]) => {
    const actorId = application.statusLogs[0]?.actorId;
    return actorId && transitionRecruiterCompanies.get(actorId) === application.jobPost.companyId
      ? actorId
      : undefined;
  };

  console.info(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        eligibleApplications: applications.length,
        conversationsToCreate: applications.filter((application) => !application.conversation)
          .length,
        assignmentsToCreate: applications.filter((application) => !application.assignments.length)
          .length,
        transitionActorsToAdd: applications.filter((application) => {
          const transitionActorId = transitionActorFor(application);
          return (
            application.conversation &&
            transitionActorId &&
            !application.conversation.participants.some(
              (participant) => participant.recruiterAccountId === transitionActorId,
            )
          );
        }).length,
        contactPreferencesToOptOut: profilesWithoutPreference,
      },
      null,
      2,
    ),
  );
  if (!execute) return;

  const profiles = await prisma.candidateProfile.findMany({
    where: { contactPreference: null },
    select: { id: true },
  });
  await prisma.candidateContactPreference.createMany({
    data: profiles.map((profile) => ({ candidateProfileId: profile.id })),
    skipDuplicates: true,
  });

  for (const application of applications) {
    await prisma.$transaction(async (tx) => {
      let recruiterIds = application.assignments.map((assignment) => assignment.recruiterAccountId);
      const transitionActorId = transitionActorFor(application);
      if (!recruiterIds.length) {
        const fallbackRecruiterId = transitionActorId ?? application.jobPost.createdByRecruiterId;
        await tx.applicationAssignment.create({
          data: {
            applicationId: application.id,
            recruiterAccountId: fallbackRecruiterId,
            assignedByActorType: ActorType.SYSTEM,
            reason: transitionActorId
              ? 'Realtime chat backfill: assigned recruiter who opened interview chat'
              : 'Realtime chat backfill: assigned job creator',
          },
        });
        recruiterIds = [fallbackRecruiterId];
      }
      if (transitionActorId && !recruiterIds.includes(transitionActorId)) {
        recruiterIds.push(transitionActorId);
      }

      const conversation =
        application.conversation ??
        (await tx.conversation.create({
          data: {
            type: ConversationType.APPLICATION_CHAT,
            status: ConversationStatus.ACTIVE,
            companyId: application.jobPost.companyId,
            applicationId: application.id,
            jobPostId: application.jobPost.id,
            createdByActorType: ActorType.SYSTEM,
            metadata: { backfilled: true },
          },
          select: { id: true },
        }));

      await tx.conversationParticipant.upsert({
        where: {
          conversationId_candidateAccountId: {
            conversationId: conversation.id,
            candidateAccountId: application.candidateProfile.candidateAccountId,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: conversation.id,
          candidateAccountId: application.candidateProfile.candidateAccountId,
          role: ConversationParticipantRole.CANDIDATE,
        },
      });
      for (const recruiterAccountId of recruiterIds) {
        await tx.conversationParticipant.upsert({
          where: {
            conversationId_recruiterAccountId: {
              conversationId: conversation.id,
              recruiterAccountId,
            },
          },
          update: { leftAt: null },
          create: {
            conversationId: conversation.id,
            recruiterAccountId,
            role: ConversationParticipantRole.RECRUITER,
          },
        });
      }

      if (!application.conversation) {
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            type: MessageType.SYSTEM,
            systemEventType: 'CHAT_BACKFILLED',
            content: 'Hội thoại được khởi tạo khi nâng cấp hệ thống.',
            metadata: { applicationStatus: application.status },
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { latestMessageId: message.id, latestMessageAt: message.createdAt },
        });
      }
    });
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
