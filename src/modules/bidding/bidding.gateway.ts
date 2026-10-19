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
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
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

export type BidAcceptedPayload = {
  bid: BiddingResponse;
  booking: {
    id: string;
    serviceId: string;
    providerId: string;
    serviceTitle: string;
    seekerId: string | null;
    seekerName: string;
    seekerPhone: string;
    address: string;
    lat: number;
    lng: number;
    requestedAt: string;
    note: string;
    status: string;
    providerViewedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  notification: {
    id: string;
    providerId: string;
    type: string;
    title: string;
    body: string;
    href: string | null;
    read: boolean;
    createdAt: string;
  };
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

  /** Provider joins a private room to receive bid-accepted alerts instantly. */
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
      return { ok: true, providerId: provider.id };
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

    // Guest job owner
    if (job.seekerId !== null) return false;
    const phone = (body.phone ?? '').replace(/\D/g, '');
    if (!phone || phone.length < 8) return false;
    if (job.guestPhone !== phone) return false;
    const name = body.name?.trim();
    if (
      name &&
      job.guestName &&
      job.guestName.toLowerCase() !== name.toLowerCase()
    ) {
      return false;
    }
    return true;
  }
}
