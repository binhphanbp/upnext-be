import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile as CloudinaryUploadedFile } from '../../common/cloudinary/cloudinary.service';
import { documentUploadOptions } from '../../common/upload/multer-options';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListConversationTagsQueryDto } from './dto/list-conversation-tags-query.dto';
import { MessageCursorQueryDto } from './dto/message-cursor-query.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationTagsDto } from './dto/update-conversation-tags.dto';
import { AddRecruiterToConversationDto } from './dto/add-recruiter-to-conversation.dto';
import { ConversationService } from './services/conversation.service';
import { ConversationMembershipService } from './services/conversation-membership.service';
import { MessageService } from './services/message.service';
import { MessageAttachmentService } from './services/message-attachment.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly memberships: ConversationMembershipService,
    private readonly messages: MessageService,
    private readonly attachments: MessageAttachmentService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationsQueryDto) {
    return this.conversations.list(user, query);
  }

  @Get('tags')
  listTags(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationTagsQueryDto) {
    return this.conversations.listTags(user, query);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.detail(id, user);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateConversationTagsDto,
  ) {
    return this.conversations.updateTags(id, dto, user);
  }

  /** Recruiters available to add, with their current per-chat/team state. */
  @Get(':id/recruiters')
  listRecruiters(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.memberships.listRecruiters(id, user);
  }

  @Get(':id/hiring-team')
  listHiringTeam(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.memberships.listHiringTeam(id, user);
  }

  /** Adds a colleague to this one conversation only. */
  @Post(':id/recruiter-participants')
  addRecruiterToConversation(
    @Param('id') id: string,
    @Body() dto: AddRecruiterToConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.addToConversation(id, dto.recruiterAccountId, user);
  }

  /** Adds a colleague to the job hiring team and every existing chat for that job. */
  @Post(':id/hiring-team/recruiters')
  addRecruiterToHiringTeam(
    @Param('id') id: string,
    @Body() dto: AddRecruiterToConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.memberships.addToHiringTeam(id, dto.recruiterAccountId, user);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MessageCursorQueryDto,
  ) {
    return this.messages.list(id, user, query);
  }

  @Post(':id/messages')
  send(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(id, user, dto);
  }

  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReadMessageDto,
  ) {
    return this.messages.markRead(id, dto.messageId, user);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: CloudinaryUploadedFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attachments.upload(id, file, user);
  }

  @Get(':id/attachments/:attachmentId/access')
  accessAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attachments.access(id, attachmentId, user);
  }
}
