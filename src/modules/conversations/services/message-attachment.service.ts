import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ConversationType,
  FilePurpose,
  FileVisibility,
  MessageAttachmentStatus,
} from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationPolicyService } from './conversation-policy.service';

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class MessageAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ConversationPolicyService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async upload(conversationId: string, file: UploadedFile | undefined, user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('File is required');
    if (!allowedMimeTypes.has(file.mimetype) || !matchesMagicBytes(file)) {
      throw new UnsupportedMediaTypeException(
        'Only valid PDF, JPEG, PNG, and WebP files are allowed',
      );
    }
    const participant = await this.policy.ensureParticipantAccess(conversationId, user);
    this.policy.assertWritable(participant.conversation);
    if (participant.conversation.type === ConversationType.TALENT_OUTREACH) {
      throw new ConflictException('Attachments are not enabled for talent outreach');
    }

    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
    const upload = await this.cloudinary.uploadBuffer(file, {
      folder: `conversation/${conversationId}`,
      fileNamePrefix: 'attachment',
      resourceType,
      deliveryType: 'authenticated',
    });
    try {
      const attachment = await this.prisma.$transaction(async (tx) => {
        const asset = await tx.fileAsset.create({
          data: {
            ownerType: 'conversation',
            ownerId: conversationId,
            purpose: FilePurpose.OTHER,
            visibility: FileVisibility.PRIVATE,
            storageKey: upload.storageKey,
            originalName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
          },
        });
        return tx.messageAttachment.create({
          data: {
            conversationId,
            fileAssetId: asset.id,
            uploadedByParticipantId: participant.id,
          },
          include: { fileAsset: true },
        });
      });
      return { data: { ...attachment, fileAsset: serializeAsset(attachment.fileAsset) } };
    } catch (error) {
      await this.cloudinary
        .deleteAsset(upload.storageKey, resourceType, 'authenticated')
        .catch(() => undefined);
      throw error;
    }
  }

  async access(conversationId: string, attachmentId: string, user: AuthenticatedUser) {
    await this.policy.assertAccess(conversationId, user);
    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        conversationId,
        status: MessageAttachmentStatus.CLAIMED,
        deletedAt: null,
      },
      include: { fileAsset: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const resourceType = attachment.fileAsset.mimeType.startsWith('image/') ? 'image' : 'raw';
    return {
      data: {
        url: this.cloudinary.createSignedUrl(attachment.fileAsset.storageKey, {
          resourceType,
          deliveryType: 'authenticated',
        }),
        expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
      },
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOrphans() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const orphans = await this.prisma.messageAttachment.findMany({
      where: {
        status: MessageAttachmentStatus.UPLOADED,
        messageId: null,
        createdAt: { lt: cutoff },
      },
      include: { fileAsset: true },
      take: 50,
    });
    for (const orphan of orphans) {
      const resourceType = orphan.fileAsset.mimeType.startsWith('image/') ? 'image' : 'raw';
      await this.cloudinary
        .deleteAsset(orphan.fileAsset.storageKey, resourceType, 'authenticated')
        .catch(() => undefined);
      await this.prisma.$transaction([
        this.prisma.messageAttachment.delete({ where: { id: orphan.id } }),
        this.prisma.fileAsset.delete({ where: { id: orphan.fileAssetId } }),
      ]);
    }
  }
}

function matchesMagicBytes(file: UploadedFile) {
  const bytes = file.buffer;
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (file.mimetype === 'image/webp') {
    return (
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    );
  }
  return false;
}

function serializeAsset(asset: { sizeBytes: bigint } & Record<string, unknown>) {
  return { ...asset, sizeBytes: asset.sizeBytes.toString() };
}
