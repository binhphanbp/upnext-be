import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class ConversationRealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }

  emitToUser(
    actor: 'candidate' | 'recruiter' | 'admin',
    actorId: string,
    event: string,
    payload: unknown,
  ) {
    this.server?.to(`user:${actor}:${actorId}`).emit(event, payload);
  }

  emitToSupportDepartment(department: string, event: string, payload: unknown) {
    this.server?.to(`support-department:${department}`).emit(event, payload);
  }
}
