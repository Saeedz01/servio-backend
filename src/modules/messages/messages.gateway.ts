import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { MessageThread } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MessageDto, MessageThreadDto } from './messages.service.js';

type AuthPayload = {
  token?: string;
};

type JoinThreadPayload = AuthPayload & {
  threadId?: string;
};

type TypingPayload = AuthPayload & {
  threadId?: string;
  isTyping?: boolean;
};

type ActorRole = 'seeker' | 'provider' | 'admin';

@WebSocketGateway({
  namespace: '/messages',
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection {
  private readonly logger = new Logger(MessagesGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Messages socket connected: ${client.id}`);
  }

  emitMessageCreated(
    thread: Pick<
      MessageThread,
      'id' | 'providerId' | 'seekerId' | 'adminId'
    >,
    message: MessageDto,
  ) {
    this.emitToThreadParticipants(thread, 'message:created', message);
  }

  emitMessageUpdated(
    thread: Pick<
      MessageThread,
      'id' | 'providerId' | 'seekerId' | 'adminId'
    >,
    message: MessageDto,
  ) {
    this.emitToThreadParticipants(thread, 'message:updated', message);
  }

  emitThreadUpserted(payload: {
    provider: { id: string; dto: MessageThreadDto };
    seeker?: { id: string; dto: MessageThreadDto };
    admin?: { id: string; dto: MessageThreadDto };
  }) {
    this.server
      .to(this.userRoom('provider', payload.provider.id))
      .emit('thread:upserted', payload.provider.dto);
    if (payload.seeker) {
      this.server
        .to(this.userRoom('seeker', payload.seeker.id))
        .emit('thread:upserted', payload.seeker.dto);
    }
    if (payload.admin) {
      this.server
        .to(this.userRoom('admin', payload.admin.id))
        .emit('thread:upserted', payload.admin.dto);
    }
  }

  emitThreadRead(payload: {
    threadId: string;
    participantKey: string;
    lastReadAt: string;
    providerId?: string;
    seekerId?: string | null;
    adminId?: string | null;
  }) {
    if (payload.providerId) {
      this.server
        .to(this.userRoom('provider', payload.providerId))
        .emit('thread:read', payload);
    }
    if (payload.seekerId) {
      this.server
        .to(this.userRoom('seeker', payload.seekerId))
        .emit('thread:read', payload);
    }
    if (payload.adminId) {
      this.server
        .to(this.userRoom('admin', payload.adminId))
        .emit('thread:read', payload);
    }
  }

  @SubscribeMessage('joinUser')
  async handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: AuthPayload,
  ) {
    const actor = await this.resolveActor(body.token);
    if (!actor) {
      return { ok: false, error: 'Unauthorized.' };
    }
    await client.join(this.userRoom(actor.role, actor.id));
    return { ok: true, role: actor.role, id: actor.id };
  }

  @SubscribeMessage('joinThread')
  async handleJoinThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinThreadPayload,
  ) {
    const threadId = body.threadId?.trim();
    if (!threadId) {
      return { ok: false, error: 'threadId is required.' };
    }
    const actor = await this.resolveActor(body.token);
    if (!actor) {
      return { ok: false, error: 'Unauthorized.' };
    }

    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) {
      return { ok: false, error: 'Thread not found.' };
    }
    if (!(await this.canAccessThread(actor, thread))) {
      return { ok: false, error: 'Forbidden.' };
    }

    await client.join(this.threadRoom(threadId));
    return { ok: true, threadId };
  }

  @SubscribeMessage('leaveThread')
  async handleLeaveThread(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinThreadPayload,
  ) {
    const threadId = body.threadId?.trim();
    if (!threadId) {
      return { ok: false, error: 'threadId is required.' };
    }
    await client.leave(this.threadRoom(threadId));
    return { ok: true, threadId };
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() _client: Socket,
    @MessageBody() body: TypingPayload,
  ) {
    const threadId = body.threadId?.trim();
    if (!threadId) {
      return { ok: false, error: 'threadId is required.' };
    }
    const actor = await this.resolveActor(body.token);
    if (!actor) {
      return { ok: false, error: 'Unauthorized.' };
    }
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });
    if (!thread || !(await this.canAccessThread(actor, thread))) {
      return { ok: false, error: 'Forbidden.' };
    }

    const payload = {
      threadId,
      participantKey: `${actor.role}:${actor.id}`,
      isTyping: Boolean(body.isTyping),
    };

    // Notify peers only (not the typer).
    if (actor.role !== 'provider') {
      this.server
        .to(this.userRoom('provider', thread.providerId))
        .emit('typing:update', payload);
    }
    if (thread.seekerId && actor.role !== 'seeker') {
      this.server
        .to(this.userRoom('seeker', thread.seekerId))
        .emit('typing:update', payload);
    }
    if (thread.adminId && actor.role !== 'admin') {
      this.server
        .to(this.userRoom('admin', thread.adminId))
        .emit('typing:update', payload);
    }

    return { ok: true };
  }

  private emitToThreadParticipants(
    thread: Pick<
      MessageThread,
      'id' | 'providerId' | 'seekerId' | 'adminId'
    >,
    event: string,
    payload: unknown,
  ) {
    this.server
      .to(this.userRoom('provider', thread.providerId))
      .emit(event, payload);
    if (thread.seekerId) {
      this.server
        .to(this.userRoom('seeker', thread.seekerId))
        .emit(event, payload);
    }
    if (thread.adminId) {
      this.server
        .to(this.userRoom('admin', thread.adminId))
        .emit(event, payload);
    }
  }

  private async canAccessThread(
    actor: { role: ActorRole; id: string },
    thread: MessageThread,
  ) {
    if (actor.role === 'provider') return thread.providerId === actor.id;
    if (actor.role === 'seeker') return thread.seekerId === actor.id;
    if (actor.role === 'admin') return thread.adminId === actor.id;
    return false;
  }

  private threadRoom(threadId: string) {
    return `thread:${threadId}`;
  }

  private userRoom(role: ActorRole, id: string) {
    return `${role}:${id}`;
  }

  private async resolveActor(
    token?: string,
  ): Promise<{ role: ActorRole; id: string } | null> {
    const raw = token?.trim();
    if (!raw) return null;
    try {
      const payload = this.jwt.verify<JwtPayload>(raw, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (payload.role === 'PROVIDER') {
        const provider = await this.prisma.provider.findUnique({
          where: { userId: payload.sub },
          select: { id: true },
        });
        if (!provider) return null;
        return { role: 'provider', id: provider.id };
      }
      if (payload.role === 'SEEKER') {
        return { role: 'seeker', id: payload.sub };
      }
      if (payload.role === 'ADMIN') {
        return { role: 'admin', id: payload.sub };
      }
      return null;
    } catch {
      return null;
    }
  }
}
