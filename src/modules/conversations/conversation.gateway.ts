import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ActorType } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { AuthIdentityService } from '../auth/services/auth-identity.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationPolicyService } from './services/conversation-policy.service';
import { ConversationRealtimeService } from './services/conversation-realtime.service';
import { MessageService } from './services/message.service';
import { CHAT_SCHEMA_VERSION, errorAck, successAck } from './types/socket-contract';

type AuthenticatedSocket = Socket;

@WebSocketGateway({ namespace: '/chat', transports: ['websocket', 'polling'] })
export class ConversationGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly identities: AuthIdentityService,
    private readonly policy: ConversationPolicyService,
    private readonly messages: MessageService,
    private readonly realtime: ConversationRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const rawToken = client.handshake.auth?.token;
      const token = typeof rawToken === 'string' ? rawToken.replace(/^Bearer\s+/i, '') : '';
      if (!token) throw new Error('Missing token');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.identities.resolveJwtPayload(payload);
      (client.data as unknown as { user: AuthenticatedUser }).user = user;
      await client.join(userRoom(user));
      if (user.role === ActorType.ADMIN) {
        for (const permission of user.permissions) {
          const match = /^support:([^:]+):handle$/.exec(permission);
          if (match) await client.join(`support-department:${match[1]}`);
        }
      }
      client.emit('connection:ready', {
        schemaVersion: CHAT_SCHEMA_VERSION,
        actor: { id: user.id, role: user.role },
        serverTime: new Date().toISOString(),
        connectionId: client.id,
      });
    } catch {
      client.emit('auth:revoked', {
        schemaVersion: CHAT_SCHEMA_VERSION,
        code: 'AUTH_EXPIRED',
        reason: 'Authentication failed',
      });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    try {
      await this.policy.assertAccess(payload.conversationId, socketUser(client));
      await client.join(`conversation:${payload.conversationId}`);
      return successAck({ conversationId: payload.conversationId });
    } catch (error) {
      return errorAck(error);
    }
  }

  @SubscribeMessage('conversation:leave')
  async leave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    await client.leave(`conversation:${payload.conversationId}`);
    return successAck({ conversationId: payload.conversationId });
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessageDto & { conversationId: string },
  ) {
    try {
      const message = await this.messages.send(payload.conversationId, socketUser(client), payload);
      return successAck(message);
    } catch (error) {
      return errorAck(error);
    }
  }

  @SubscribeMessage('message:read')
  async read(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string; messageId: string },
  ) {
    try {
      const marker = await this.messages.markRead(
        payload.conversationId,
        payload.messageId,
        socketUser(client),
      );
      return successAck(marker);
    } catch (error) {
      return errorAck(error);
    }
  }

  @SubscribeMessage('typing:start')
  async typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    try {
      const participant = await this.policy.assertAccess(
        payload.conversationId,
        socketUser(client),
      );
      this.policy.assertWritable(participant.conversation);
      client.to(`conversation:${payload.conversationId}`).emit('typing:updated', {
        schemaVersion: CHAT_SCHEMA_VERSION,
        conversationId: payload.conversationId,
        participantId: participant.id,
        isTyping: true,
        expiresAt: new Date(Date.now() + 5_000).toISOString(),
      });
    } catch {
      return;
    }
  }

  @SubscribeMessage('typing:stop')
  async typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const participant = await this.policy.assertAccess(payload.conversationId, socketUser(client));
    client.to(`conversation:${payload.conversationId}`).emit('typing:updated', {
      schemaVersion: CHAT_SCHEMA_VERSION,
      conversationId: payload.conversationId,
      participantId: participant.id,
      isTyping: false,
      expiresAt: new Date().toISOString(),
    });
  }
}

function userRoom(user: AuthenticatedUser): string {
  return `user:${user.role.toLowerCase()}:${user.id}`;
}

function socketUser(client: Socket): AuthenticatedUser {
  const value = (client.data as unknown as { user?: unknown }).user;
  if (!value || typeof value !== 'object') throw new Error('Socket is not authenticated');
  const candidate = value as Partial<AuthenticatedUser>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.email !== 'string' ||
    !Object.values(ActorType).includes(candidate.role as ActorType) ||
    !Array.isArray(candidate.permissions)
  ) {
    throw new Error('Socket is not authenticated');
  }
  return candidate as AuthenticatedUser;
}
