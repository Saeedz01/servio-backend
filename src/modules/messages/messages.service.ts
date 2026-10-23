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
  type Prisma,
  type Provider,
  type User,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DeliverMessagesDto } from './dto/deliver-messages.dto.js';
import type { EditMessageDto } from './dto/edit-message.dto.js';
import type { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import type { OpenThreadDto } from './dto/open-thread.dto.js';
import type {
  MessageAttachmentDto,
  SendMessageDto,
} from './dto/send-message.dto.js';
import { MessagesGateway } from './messages.gateway.js';

export type MessageParticipantDto = {
  role: 'seeker' | 'provider' | 'admin';
  id: string;
};

export type MessageAttachmentOut = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type MessageDto = {
  id: string;
  threadId: string;
  sender: MessageParticipantDto;
  body: string;
  attachments: MessageAttachmentOut[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  status: 'sent' | 'delivered' | 'read';
};

export type MessagePageDto = {
  items: MessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
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

const ALLOWED_ATTACHMENT_PREFIXES = ['image/', 'application/pdf'] as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MessagesGateway,
  ) {}

  async listThreads(
    user: JwtPayload,
    q?: string,
  ): Promise<MessageThreadDto[]> {
    const actor = await this.resolveActor(user);
    const where: Prisma.MessageThreadWhereInput =
      actor.role === 'provider'
        ? { providerId: actor.id }
        : actor.role === 'admin'
          ? { adminId: actor.id }
          : { seekerId: actor.id };

    const query = q?.trim();
    if (query) {
      where.OR = [
        { serviceTitle: { contains: query, mode: 'insensitive' } },
        { lastMessagePreview: { contains: query, mode: 'insensitive' } },
        {
          provider: {
            user: { name: { contains: query, mode: 'insensitive' } },
          },
        },
        { seeker: { name: { contains: query, mode: 'insensitive' } } },
        { admin: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

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
    query: ListMessagesQueryDto,
  ): Promise<MessagePageDto> {
    const actor = await this.resolveActor(user);
    await this.requireThreadAccess(threadId, actor);

    const limit = query.limit ?? 40;
    const search = query.q?.trim();
    const where: Prisma.MessageWhereInput = { threadId };
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new BadRequestException('Invalid cursor.');
      }
      where.createdAt = { lt: cursorDate };
    }
    if (search) {
      where.AND = [
        { deletedAt: null },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const chronological = [...page].reverse();
    const nextCursor =
      hasMore && chronological.length > 0
        ? chronological[0]!.createdAt.toISOString()
        : null;

    return {
      items: chronological.map((row) => this.toMessageDto(row, actor)),
      nextCursor,
      hasMore,
    };
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
    const body = (dto.body ?? '').trim();
    const attachments = this.normalizeAttachments(dto.attachments);
    if (!body && attachments.length === 0) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const senderRole = this.toSenderRole(actor.role);
    const preview =
      body.slice(0, 160) ||
      (attachments.length > 0
        ? `Attachment: ${attachments[0]!.name}`
        : '');

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: thread.id,
          senderRole,
          senderId: actor.id,
          body,
          attachments,
        },
      });

      await tx.messageThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: created.createdAt,
          lastMessagePreview: preview,
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

    const messageDto = this.toMessageDto(message, actor);
    this.gateway.emitMessageCreated(thread, messageDto);

    const fresh = await this.prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude,
    });
    if (fresh) {
      await this.broadcastThread(fresh);
    }

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
          title:
            actor.role === 'admin' ? 'Message from Serveo admin' : 'New message',
          body: `${fromName}: ${preview.slice(0, 120)}`,
          href,
        },
      });
    }

    return messageDto;
  }

  async editMessage(
    threadId: string,
    messageId: string,
    dto: EditMessageDto,
    user: JwtPayload,
  ): Promise<MessageDto> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, threadId },
    });
    if (!existing) {
      throw new NotFoundException('Message not found.');
    }
    if (existing.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted message.');
    }
    this.assertOwnsMessage(existing, actor);

    const updated = await this.prisma.message.update({
      where: { id: existing.id },
      data: { body, editedAt: new Date() },
    });

    const latest = await this.prisma.message.findFirst({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.id === updated.id) {
      await this.prisma.messageThread.update({
        where: { id: threadId },
        data: { lastMessagePreview: body.slice(0, 160) },
      });
    }

    const messageDto = this.toMessageDto(updated, actor);
    this.gateway.emitMessageUpdated(thread, messageDto);
    return messageDto;
  }

  async deleteMessage(
    threadId: string,
    messageId: string,
    user: JwtPayload,
  ): Promise<MessageDto> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, threadId },
    });
    if (!existing) {
      throw new NotFoundException('Message not found.');
    }
    if (existing.deletedAt) {
      return this.toMessageDto(existing, actor);
    }
    this.assertOwnsMessage(existing, actor);

    const deletedAt = new Date();
    const updated = await this.prisma.message.update({
      where: { id: existing.id },
      data: {
        deletedAt,
        body: '',
        attachments: [],
      },
    });

    const latest = await this.prisma.message.findFirst({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: {
        lastMessagePreview: latest
          ? latest.body.slice(0, 160) ||
            (this.parseAttachments(latest.attachments)[0]
              ? `Attachment: ${this.parseAttachments(latest.attachments)[0]!.name}`
              : 'Message deleted')
          : 'Message deleted',
        lastMessageAt: latest?.createdAt ?? thread.lastMessageAt,
      },
    });

    const messageDto = this.toMessageDto(updated, actor);
    this.gateway.emitMessageUpdated(thread, messageDto);
    return messageDto;
  }

  async markDelivered(
    threadId: string,
    dto: DeliverMessagesDto,
    user: JwtPayload,
  ): Promise<{ ok: true; updated: MessageDto[] }> {
    const actor = await this.resolveActor(user);
    const thread = await this.requireThreadAccess(threadId, actor);
    const myRole = this.toSenderRole(actor.role);
    const now = new Date();

    const candidates = await this.prisma.message.findMany({
      where: {
        threadId,
        id: { in: dto.messageIds },
        deletedAt: null,
        deliveredAt: null,
        NOT: {
          AND: [{ senderRole: myRole }, { senderId: actor.id }],
        },
      },
    });

    if (candidates.length === 0) {
      return { ok: true, updated: [] };
    }

    await this.prisma.message.updateMany({
      where: { id: { in: candidates.map((row) => row.id) } },
      data: { deliveredAt: now },
    });

    const updatedRows = await this.prisma.message.findMany({
      where: { id: { in: candidates.map((row) => row.id) } },
    });
    const updated = updatedRows.map((row) => this.toMessageDto(row, actor));
    for (const message of updated) {
      this.gateway.emitMessageUpdated(thread, message);
    }
    return { ok: true, updated };
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

    // Mark peer-authored messages as delivered + read up to now.
    const peerMessages = await this.prisma.message.findMany({
      where: {
        threadId,
        deletedAt: null,
        createdAt: { lte: lastReadAt },
        readAt: null,
        NOT: {
          AND: [{ senderRole: role }, { senderId: actor.id }],
        },
      },
    });

    if (peerMessages.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: peerMessages.map((row) => row.id) } },
        data: {
          deliveredAt: lastReadAt,
          readAt: lastReadAt,
        },
      });
      const refreshed = await this.prisma.message.findMany({
        where: { id: { in: peerMessages.map((row) => row.id) } },
      });
      for (const row of refreshed) {
        this.gateway.emitMessageUpdated(thread, this.toMessageDto(row, actor));
      }
    }

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
    if (!booking.seeker) {
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

  private assertOwnsMessage(message: Message, actor: Actor) {
    const role = this.toSenderRole(actor.role);
    if (message.senderRole !== role || message.senderId !== actor.id) {
      throw new ForbiddenException('You can only change your own messages.');
    }
  }

  private normalizeAttachments(
    input?: MessageAttachmentDto[],
  ): MessageAttachmentOut[] {
    if (!input?.length) return [];
    return input.map((item) => {
      const mimeType = item.mimeType.trim().toLowerCase();
      const allowed = ALLOWED_ATTACHMENT_PREFIXES.some(
        (prefix) =>
          mimeType === prefix ||
          (prefix.endsWith('/') && mimeType.startsWith(prefix)),
      );
      if (!allowed) {
        throw new BadRequestException(
          'Only images and PDF attachments are allowed.',
        );
      }
      const url = item.url.trim();
      if (!url.startsWith('data:') && !url.startsWith('https://')) {
        throw new BadRequestException('Attachment URL must be data: or https.');
      }
      if (item.sizeBytes > 5_000_000) {
        throw new BadRequestException('Attachment exceeds 5MB limit.');
      }
      return {
        id: randomUUID(),
        name: item.name.trim().slice(0, 200),
        mimeType,
        sizeBytes: item.sizeBytes,
        url,
      };
    });
  }

  private parseAttachments(raw: Prisma.JsonValue): MessageAttachmentOut[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.mimeType !== 'string' ||
        typeof row.sizeBytes !== 'number' ||
        typeof row.url !== 'string'
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          name: row.name,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          url: row.url,
        },
      ];
    });
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

  private toMessageDto(message: Message, _viewer?: Actor): MessageDto {
    const role =
      message.senderRole === MessageSenderRole.PROVIDER
        ? 'provider'
        : message.senderRole === MessageSenderRole.ADMIN
          ? 'admin'
          : 'seeker';

    // Always derive from receipt timestamps so socket fans-out correctly
    // to the sender when a peer delivers/reads.
    let status: MessageDto['status'] = 'sent';
    if (message.readAt) status = 'read';
    else if (message.deliveredAt) status = 'delivered';

    return {
      id: message.id,
      threadId: message.threadId,
      sender: { role, id: message.senderId },
      body: message.deletedAt ? '' : message.body,
      attachments: message.deletedAt
        ? []
        : this.parseAttachments(message.attachments),
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      deletedAt: message.deletedAt?.toISOString() ?? null,
      status,
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
          deletedAt: null,
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
