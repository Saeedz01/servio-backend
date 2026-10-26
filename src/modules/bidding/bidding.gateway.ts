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
import { Server, Socket } from 'socket.io';
import { ServiceStatus } from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BookingResponse } from '../bookings/bookings.service.js';
import type { JobResponse } from '../jobs/jobs.service.js';
import type { BiddingResponse } from './bidding.service.js';

type JoinJobPayload = {
  jobId?: string;
  token?: string;
  phone?: string;
  name?: string;
};

type JoinProviderPayload = {
  token?: string;
};

export type ProviderNotificationPayload = {
  id: string;
  providerId: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export type BidAcceptedPayload = {
  bid: BiddingResponse;
  booking: BookingResponse;
  notification: ProviderNotificationPayload;
};

export type BookingCreatedPayload = {
  booking: BookingResponse;
  notification: ProviderNotificationPayload;
};

export type JobCreatedPayload = {
  job: JobResponse;
};

export type BookingWithdrawnPayload = {
  bookingId: string;
  providerId: string;
};

@WebSocketGateway({
  namespace: '/bidding',
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class BiddingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(BiddingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Bidding socket connected: ${client.id}`);
  }

  emitBidCreated(jobId: string, bid: BiddingResponse) {
    this.server.to(this.jobRoom(jobId)).emit('bid:created', bid);
  }

  emitBidsUpdated(jobId: string, bids: BiddingResponse[]) {
    this.server.to(this.jobRoom(jobId)).emit('bids:updated', bids);
  }

  emitBidAccepted(providerId: string, payload: BidAcceptedPayload) {
    this.server
      .to(this.providerRoom(providerId))
      .emit('bid:accepted', payload);
  }

  /** Instant booking request for the owning provider. */
  emitBookingCreated(providerId: string, payload: BookingCreatedPayload) {
    this.server
      .to(this.providerRoom(providerId))
      .emit('booking:created', payload);
  }

  /** Instant open-job alert for providers watching this category. */
  emitJobCreated(categoryId: string, payload: JobCreatedPayload) {
    this.server.to(this.categoryRoom(categoryId)).emit('job:created', payload);
  }

  /** Seeker withdrew a request — remove it from the provider’s list instantly. */
  emitBookingWithdrawn(
    providerId: string,
    payload: BookingWithdrawnPayload,
  ) {
    this.server
      .to(this.providerRoom(providerId))
      .emit('booking:withdrawn', payload);
  }

  @SubscribeMessage('joinJob')
  async handleJoinJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinJobPayload,
  ) {
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return { ok: false, error: 'jobId is required.' };
    }

    const allowed = await this.canWatchJob(jobId, body);
    if (!allowed) {
      return { ok: false, error: 'Not allowed to watch bids for this job.' };
    }

    await client.join(this.jobRoom(jobId));
    return { ok: true, jobId };
  }

  @SubscribeMessage('leaveJob')
  async handleLeaveJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinJobPayload,
  ) {
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return { ok: false, error: 'jobId is required.' };
    }
    await client.leave(this.jobRoom(jobId));
    return { ok: true, jobId };
  }

  /**
   * Provider joins a private room (bookings / bid-accepted) plus category
   * rooms for their published services (new open jobs).
   */
  @SubscribeMessage('joinProvider')
  async handleJoinProvider(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinProviderPayload,
  ) {
    const token = body.token?.trim();
    if (!token) {
      return { ok: false, error: 'token is required.' };
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (payload.role !== 'PROVIDER') {
        return { ok: false, error: 'Only providers can join this room.' };
      }
      const provider = await this.prisma.provider.findUnique({
        where: { userId: payload.sub },
        select: { id: true },
      });
      if (!provider) {
        return { ok: false, error: 'Provider profile not found.' };
      }
      await client.join(this.providerRoom(provider.id));

      const categoryIds = await this.publishedCategoryIds(provider.id);
      for (const categoryId of categoryIds) {
        await client.join(this.categoryRoom(categoryId));
      }
      client.data.providerId = provider.id;
      client.data.categoryIds = categoryIds;

      return {
        ok: true,
        providerId: provider.id,
        categoryIds,
      };
    } catch {
      return { ok: false, error: 'Invalid token.' };
    }
  }

  @SubscribeMessage('leaveProvider')
  async handleLeaveProvider(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinProviderPayload,
  ) {
    const token = body.token?.trim();
    if (!token) {
      return { ok: false, error: 'token is required.' };
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      const provider = await this.prisma.provider.findUnique({
        where: { userId: payload.sub },
        select: { id: true },
      });
      if (provider) {
        await client.leave(this.providerRoom(provider.id));
        const categoryIds: string[] =
          (client.data.categoryIds as string[] | undefined) ??
          (await this.publishedCategoryIds(provider.id));
        for (const categoryId of categoryIds) {
          await client.leave(this.categoryRoom(categoryId));
        }
        client.data.providerId = undefined;
        client.data.categoryIds = undefined;
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Invalid token.' };
    }
  }

  private jobRoom(jobId: string) {
    return `job:${jobId}`;
  }

  private providerRoom(providerId: string) {
    return `provider:${providerId}`;
  }

  private categoryRoom(categoryId: string) {
    return `category:${categoryId}`;
  }

  private async publishedCategoryIds(providerId: string): Promise<string[]> {
    const services = await this.prisma.service.findMany({
      where: {
        providerId,
        status: ServiceStatus.PUBLISHED,
      },
      select: { categoryId: true },
      distinct: ['categoryId'],
    });
    return services.map((service) => service.categoryId);
  }

  private async canWatchJob(
    jobId: string,
    body: JoinJobPayload,
  ): Promise<boolean> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return false;

    const token = body.token?.trim();
    if (token) {
      try {
        const payload = this.jwt.verify<JwtPayload>(token, {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
        });
        if (payload.role === 'SEEKER' && job.seekerId === payload.sub) {
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }

    return false;
  }
}
