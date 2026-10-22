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

  /**
   * Deliver once per participant via their user room only.
   * Avoid also emitting to the thread room — clients in both rooms would
   * receive duplicates and inflate unread counts.
   */
  emitMessageCreated(
    thread: Pick<
      MessageThread,
      'id' | 'providerId' | 'seekerId' | 'adminId'
    >,
    message: MessageDto,
  ) {
    this.server
      .to(this.userRoom('provider', thread.providerId))
      .emit('message:created', message);
    if (thread.seekerId) {
      this.server
        .to(this.userRoom('seeker', thread.seekerId))
        .emit('message:created', message);
    }
    if (thread.adminId) {
      this.server
        .to(this.userRoom('admin', thread.adminId))
        .emit('message:created', message);
    }
  }

  /** Each participant gets a DTO with their own unreadCount / peer view. */
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
    // Fan out to user rooms so inbox badges clear even if not in the thread room.
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
    if (actor.role === 'provider' && thread.providerId !== actor.id) {
      return { ok: false, error: 'Forbidden.' };
    }
    if (actor.role === 'seeker' && thread.seekerId !== actor.id) {
      return { ok: false, error: 'Forbidden.' };
    }
    if (actor.role === 'admin' && thread.adminId !== actor.id) {
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
