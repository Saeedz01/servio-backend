import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MessageSenderRole,
  type Message,
  type MessageReadState,
  type MessageThread,
  type Provider,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { OpenThreadDto } from './dto/open-thread.dto.js';
import type { SendMessageDto } from './dto/send-message.dto.js';
import { MessagesGateway } from './messages.gateway.js';

export type MessageParticipantDto = {
  role: 'seeker' | 'provider' | 'admin';
  id: string;
};

export type MessageThreadDto = {
  id: string;
  participants: [MessageParticipantDto, MessageParticipantDto];
  participantNames: Record<string, string>;
  contextServiceId?: string;
  contextServiceTitle?: string;
  contextBookingId?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  createdAt: string;
  unreadCount: number;
  peer: MessageParticipantDto;
  peerName: string;
};

export type MessageDto = {
  id: string;
  threadId: string;
  sender: MessageParticipantDto;
  body: string;
  createdAt: string;
  status: 'sent';
};

type Actor = {
  role: 'seeker' | 'provider' | 'admin';
  id: string;
  name: string;
};

type ThreadWithRelations = MessageThread & {
  provider: Provider & { user: User };
  seeker: User | null;
  admin: User | null;
  readStates: MessageReadState[];
  messages?: Message[];
};

const threadInclude = {
  provider: { include: { user: true } },
  seeker: true,
  admin: true,
  readStates: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MessagesGateway,
  ) {}

  async listThreads(user: JwtPayload): Promise<MessageThreadDto[]> {
    const actor = await this.resolveActor(user);
    const where =
      actor.role === 'provider'
        ? { providerId: actor.id }
        : actor.role === 'admin'
          ? { adminId: actor.id }
          : { seekerId: actor.id };

    const rows = await this.prisma.messageThread.findMany({
      where,
      include: threadInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });
    return this.attachUnreadCounts(rows, actor);
  }

  async getThread(threadId: string, user: JwtPayload): Promise<MessageThreadDto> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const [dto] = await this.attachUnreadCounts([thread], actor);
    return dto!;
  }

  async listMessages(
    threadId: string,
    user: JwtPayload,
  ): Promise<MessageDto[]> {
    const actor = await this.resolveActor(user);
    await this.requireThreadAccess(threadId, actor);
    const rows = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toMessageDto(row));
  }

  async openThread(
    dto: OpenThreadDto,
    user: JwtPayload,
  ): Promise<MessageThreadDto> {
    const actor = await this.resolveActor(user);
    const bookingId = dto.bookingId?.trim();

    if (bookingId) {
      return this.openForBooking(bookingId, actor);
    }

    const providerId = dto.providerId?.trim();
    if (!providerId) {
      throw new BadRequestException('providerId or bookingId is required.');
    }

    if (actor.role === 'admin') {
      return this.openForAdminService(
        actor,
        providerId,
        dto.serviceId?.trim(),
        dto.serviceTitle?.trim() ?? '',
      );
    }

    if (actor.role !== 'seeker') {
      throw new BadRequestException(
        'Providers open chat from a booking. Pass bookingId.',
      );
    }

    return this.openForServiceInquiry(
      actor.id,
      providerId,
      dto.serviceId?.trim(),
      dto.serviceTitle?.trim() ?? '',
      actor,
    );
  }

  async sendMessage(
    threadId: string,
    dto: SendMessageDto,
    user: JwtPayload,
  ): Promise<MessageDto> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const senderRole = this.toSenderRole(actor.role);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: thread.id,
          senderRole,
          senderId: actor.id,
          body,
        },
      });

      await tx.messageThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: created.createdAt,
          lastMessagePreview: body.slice(0, 160),
        },
      });

      await tx.messageReadState.upsert({
        where: {
          threadId_participantRole_participantId: {
            threadId: thread.id,
            participantRole: senderRole,
            participantId: actor.id,
          },
        },
        create: {
          threadId: thread.id,
          participantRole: senderRole,
          participantId: actor.id,
          lastReadAt: created.createdAt,
        },
        update: { lastReadAt: created.createdAt },
      });

      return created;
    });

    const messageDto = this.toMessageDto(message);
    this.gateway.emitMessageCreated(thread, messageDto);

    const fresh = await this.prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude,
    });
    if (fresh) {
      await this.broadcastThread(fresh);
    }

    // Notify provider when seeker or admin writes.
    if (actor.role === 'seeker' || actor.role === 'admin') {
      const href = thread.bookingId
        ? `/provider/bookings/${thread.bookingId}?chat=1`
        : `/provider/messages/${thread.id}`;
      const fromName =
        actor.role === 'admin'
          ? `Admin (${actor.name})`
          : (thread.seeker?.name ?? actor.name);
      await this.prisma.notification.create({
        data: {
          providerId: thread.providerId,
          type: 'chat_message',
          title: actor.role === 'admin' ? 'Message from Serveo admin' : 'New message',
          body: `${fromName}: ${body.slice(0, 120)}`,
          href,
        },
      });
    }

    return messageDto;
  }

  async markRead(threadId: string, user: JwtPayload): Promise<{ ok: true }> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const role = this.toSenderRole(actor.role);
    const lastReadAt = new Date();

    await this.prisma.messageReadState.upsert({
      where: {
        threadId_participantRole_participantId: {
          threadId,
          participantRole: role,
          participantId: actor.id,
        },
      },
      create: {
        threadId,
        participantRole: role,
        participantId: actor.id,
        lastReadAt,
      },
      update: { lastReadAt },
    });

    this.gateway.emitThreadRead({
      threadId,
      participantKey: `${actor.role}:${actor.id}`,
      lastReadAt: lastReadAt.toISOString(),
      providerId: thread.providerId,
      seekerId: thread.seekerId,
      adminId: thread.adminId,
    });

    return { ok: true };
  }

  private async openForAdminService(
    actor: Actor,
    providerId: string,
    serviceId: string | undefined,
    serviceTitle: string,
  ): Promise<MessageThreadDto> {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
      include: { user: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found.');
    }

    let title = serviceTitle;
    if (serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (!service || service.providerId !== providerId) {
        throw new BadRequestException('Service does not belong to this provider.');
      }
      title = title || service.title;
    }
    if (!title.trim()) {
      title = 'Service discussion';
    }

    let thread = await this.prisma.messageThread.findFirst({
      where: {
        adminId: actor.id,
        providerId,
        seekerId: null,
        bookingId: null,
        serviceId: serviceId ?? null,
      },
      include: threadInclude,
    });

    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: {
          adminId: actor.id,
          providerId,
          serviceId: serviceId ?? null,
          serviceTitle: title,
        },
        include: threadInclude,
      });
    }

    await this.broadcastThread(thread);
    const [dto] = await this.attachUnreadCounts([thread], actor);
    return dto!;
  }

  private async openForBooking(
    bookingId: string,
    actor: Actor,
  ): Promise<MessageThreadDto> {
    if (actor.role === 'admin') {
      throw new BadRequestException(
        'Admins message providers about a service, not a booking.',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        seeker: true,
        provider: { include: { user: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }
    if (!booking.seekerId || !booking.seeker) {
      throw new BadRequestException(
        'Chat requires a logged-in seeker on this booking.',
      );
    }

    if (actor.role === 'provider' && booking.providerId !== actor.id) {
      throw new ForbiddenException('Not your booking.');
    }
    if (actor.role === 'seeker' && booking.seekerId !== actor.id) {
      throw new ForbiddenException('Not your booking.');
    }

    let thread = await this.prisma.messageThread.findUnique({
      where: { bookingId: booking.id },
      include: threadInclude,
    });

    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: {
          bookingId: booking.id,
          providerId: booking.providerId,
          seekerId: booking.seekerId,
          serviceId: booking.serviceId,
          serviceTitle: booking.serviceTitle,
        },
        include: threadInclude,
      });
    }

    await this.broadcastThread(thread);
    const [dto] = await this.attachUnreadCounts([thread], actor);
    return dto!;
  }

  private async openForServiceInquiry(
    seekerId: string,
    providerId: string,
    serviceId: string | undefined,
    serviceTitle: string,
    actor: Actor,
  ): Promise<MessageThreadDto> {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
      include: { user: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found.');
    }

    let title = serviceTitle;
    if (serviceId) {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (service) {
        if (service.providerId !== providerId) {
          throw new BadRequestException('Service does not belong to provider.');
        }
        title = title || service.title;
      }
    }

    let thread = await this.prisma.messageThread.findFirst({
      where: {
        bookingId: null,
        adminId: null,
        providerId,
        seekerId,
        serviceId: serviceId ?? null,
      },
      include: threadInclude,
    });

    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: {
          providerId,
          seekerId,
          serviceId: serviceId ?? null,
          serviceTitle: title,
        },
        include: threadInclude,
      });
    }

    await this.broadcastThread(thread);
    const [dto] = await this.attachUnreadCounts([thread], actor);
    return dto!;
  }

  private async broadcastThread(thread: ThreadWithRelations): Promise<void> {
    const providerActor: Actor = {
      role: 'provider',
      id: thread.providerId,
      name: thread.provider.user.name,
    };
    const [providerDto] = await this.attachUnreadCounts(
      [thread],
      providerActor,
    );

    const payload: {
      provider: { id: string; dto: MessageThreadDto };
      seeker?: { id: string; dto: MessageThreadDto };
      admin?: { id: string; dto: MessageThreadDto };
    } = {
      provider: { id: thread.providerId, dto: providerDto! },
    };

    if (thread.seekerId && thread.seeker) {
      const seekerActor: Actor = {
        role: 'seeker',
        id: thread.seekerId,
        name: thread.seeker.name,
      };
      const [seekerDto] = await this.attachUnreadCounts([thread], seekerActor);
      payload.seeker = { id: thread.seekerId, dto: seekerDto! };
    }

    if (thread.adminId && thread.admin) {
      const adminActor: Actor = {
        role: 'admin',
        id: thread.adminId,
        name: thread.admin.name,
      };
      const [adminDto] = await this.attachUnreadCounts([thread], adminActor);
      payload.admin = { id: thread.adminId, dto: adminDto! };
    }

    this.gateway.emitThreadUpserted(payload);
  }

  private async requireThreadAccess(
    threadId: string,
    actor: Actor,
  ): Promise<ThreadWithRelations> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: threadInclude,
    });
    if (!thread) {
      throw new NotFoundException('Thread not found.');
    }
    if (actor.role === 'provider' && thread.providerId !== actor.id) {
      throw new ForbiddenException('Not your conversation.');
    }
    if (actor.role === 'seeker' && thread.seekerId !== actor.id) {
      throw new ForbiddenException('Not your conversation.');
    }
    if (actor.role === 'admin' && thread.adminId !== actor.id) {
      throw new ForbiddenException('Not your conversation.');
    }
    return thread;
  }

  private async resolveActor(user: JwtPayload): Promise<Actor> {
    if (user.role === 'PROVIDER') {
      const provider = await this.prisma.provider.findUnique({
        where: { userId: user.sub },
        include: { user: true },
      });
      if (!provider) {
        throw new UnauthorizedException('Provider profile not found.');
      }
      return {
        role: 'provider',
        id: provider.id,
        name: provider.user.name,
      };
    }
    if (user.role === 'SEEKER') {
      const seeker = await this.prisma.user.findUnique({
        where: { id: user.sub },
      });
      if (!seeker) {
        throw new UnauthorizedException('Seeker account not found.');
      }
      return { role: 'seeker', id: seeker.id, name: seeker.name };
    }
    if (user.role === 'ADMIN') {
      const admin = await this.prisma.user.findUnique({
        where: { id: user.sub },
      });
      if (!admin) {
        throw new UnauthorizedException('Admin account not found.');
      }
      return { role: 'admin', id: admin.id, name: admin.name };
    }
    throw new ForbiddenException(
      'Only seekers, providers, and admins can use messages.',
    );
  }

  private toSenderRole(role: Actor['role']): MessageSenderRole {
    if (role === 'provider') return MessageSenderRole.PROVIDER;
    if (role === 'admin') return MessageSenderRole.ADMIN;
    return MessageSenderRole.SEEKER;
  }

  private toThreadDto(
    thread: ThreadWithRelations,
    actor: Actor,
  ): MessageThreadDto {
    const provider: MessageParticipantDto = {
      role: 'provider',
      id: thread.providerId,
    };

    let counterpart: MessageParticipantDto;
    let counterpartName: string;
    if (thread.adminId && thread.admin) {
      counterpart = { role: 'admin', id: thread.adminId };
      counterpartName = thread.admin.name;
    } else if (thread.seekerId && thread.seeker) {
      counterpart = { role: 'seeker', id: thread.seekerId };
      counterpartName = thread.seeker.name;
    } else {
      throw new BadRequestException('Thread has no seeker or admin participant.');
    }

    const participantNames: Record<string, string> = {
      [`provider:${thread.providerId}`]: thread.provider.user.name,
      [`${counterpart.role}:${counterpart.id}`]: counterpartName,
    };

    const peer = actor.role === 'provider' ? counterpart : provider;
    const peerName =
      actor.role === 'provider' ? counterpartName : thread.provider.user.name;

    return {
      id: thread.id,
      participants: [counterpart, provider],
      participantNames,
      contextServiceId: thread.serviceId ?? undefined,
      contextServiceTitle: thread.serviceTitle || undefined,
      contextBookingId: thread.bookingId ?? undefined,
      lastMessageAt:
        thread.lastMessageAt?.toISOString() ?? thread.createdAt.toISOString(),
      lastMessagePreview: thread.lastMessagePreview,
      createdAt: thread.createdAt.toISOString(),
      unreadCount: 0,
      peer,
      peerName,
    };
  }

  private toMessageDto(message: Message): MessageDto {
    const role =
      message.senderRole === MessageSenderRole.PROVIDER
        ? 'provider'
        : message.senderRole === MessageSenderRole.ADMIN
          ? 'admin'
          : 'seeker';
    return {
      id: message.id,
      threadId: message.threadId,
      sender: { role, id: message.senderId },
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      status: 'sent',
    };
  }

  private async attachUnreadCounts(
    threads: ThreadWithRelations[],
    actor: Actor,
  ): Promise<MessageThreadDto[]> {
    const myRole = this.toSenderRole(actor.role);
    const dtos: MessageThreadDto[] = [];
    for (const thread of threads) {
      const myRead = thread.readStates.find(
        (row) =>
          row.participantRole === myRole && row.participantId === actor.id,
      );
      const lastReadAt = myRead?.lastReadAt ?? new Date(0);
      const unreadCount = await this.prisma.message.count({
        where: {
          threadId: thread.id,
          createdAt: { gt: lastReadAt },
          NOT: {
            AND: [{ senderRole: myRole }, { senderId: actor.id }],
          },
        },
      });
      const dto = this.toThreadDto(thread, actor);
      dto.unreadCount = unreadCount;
      dtos.push(dto);
    }
    return dtos;
  }
}
