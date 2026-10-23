import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountStatus,
  BiddingStatus,
  BookingStatus,
  JobStatus,
  ServiceStatus,
  type Bidding,
  type Job,
  type Provider,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BookingResponse } from '../bookings/bookings.service.js';
import type { NotificationResponse } from '../notifications/notifications.service.js';
import { BiddingGateway } from './bidding.gateway.js';
import type { CreateBiddingDto } from './dto/create-bidding.dto.js';

export type BiddingStatusDto = 'pending' | 'accepted' | 'rejected';

export type BiddingResponse = {
  id: string;
  jobId: string;
  providerId: string;
  providerName: string;
  price: number;
  note: string;
  status: BiddingStatusDto;
  createdAt: string;
  updatedAt: string;
};

export type AcceptBiddingResponse = {
  bid: BiddingResponse;
  booking: BookingResponse;
  notification: NotificationResponse;
};

type BiddingWithProvider = Bidding & {
  provider: Provider & { user: User };
};

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biddingGateway: BiddingGateway,
  ) {}

  async create(
    dto: CreateBiddingDto,
    user: JwtPayload,
  ): Promise<BiddingResponse> {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can place bids.');
    }

    const provider = await this.requireVerifiedProvider(user.sub);
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId.trim() },
    });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    if (job.status !== JobStatus.OPEN) {
      throw new BadRequestException('This job is no longer open for bids.');
    }

    const price = Number(dto.price);
    if (!Number.isFinite(price) || price < 1) {
      throw new BadRequestException('Enter a valid bid price.');
    }

    const existing = await this.prisma.bidding.findUnique({
      where: {
        jobId_providerId: {
          jobId: job.id,
          providerId: provider.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already placed a bid on this job. Wait for the seeker to respond.',
      );
    }

    const bid = await this.prisma.bidding.create({
      data: {
        jobId: job.id,
        providerId: provider.id,
        price,
        note: dto.note?.trim() ?? '',
        status: BiddingStatus.PENDING,
      },
      include: {
        provider: { include: { user: true } },
      },
    });

    const response = this.toResponse(bid);
    this.biddingGateway.emitBidCreated(job.id, response);
    return response;
  }

  /** Seeker accepts a bid → booked booking + provider notification. */
  async accept(
    bidId: string,
    user: JwtPayload,
  ): Promise<AcceptBiddingResponse> {
    const bid = await this.prisma.bidding.findUnique({
      where: { id: bidId.trim() },
      include: {
        job: true,
        provider: { include: { user: true } },
      },
    });
    if (!bid) {
      throw new NotFoundException('Bid not found.');
    }

    this.assertCanAcceptJob(bid.job, user);

    if (bid.job.status !== JobStatus.OPEN) {
      throw new BadRequestException('This job is no longer open.');
    }
    if (bid.status !== BiddingStatus.PENDING) {
      throw new BadRequestException('This bid is no longer available.');
    }

    const service = await this.prisma.service.findFirst({
      where: {
        providerId: bid.providerId,
        categoryId: bid.job.categoryId,
        status: ServiceStatus.PUBLISHED,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!service) {
      throw new BadRequestException(
        'This provider has no published service in this category to book against.',
      );
    }

    const seeker = await this.prisma.user.findUnique({
      where: { id: bid.job.seekerId },
      select: { name: true },
    });
    const seekerName = seeker?.name?.trim() || 'A seeker';

    const noteParts = [
      `Awarded from job bid ($${bid.price.toFixed(0)}).`,
      bid.note.trim() ? bid.note.trim() : '',
      bid.job.description.trim() ? `Job: ${bid.job.description.trim()}` : '',
    ].filter(Boolean);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.bidding.updateMany({
        where: {
          jobId: bid.jobId,
          id: { not: bid.id },
          status: BiddingStatus.PENDING,
        },
        data: { status: BiddingStatus.REJECTED },
      });

      const accepted = await tx.bidding.update({
        where: { id: bid.id },
        data: { status: BiddingStatus.ACCEPTED },
        include: { provider: { include: { user: true } } },
      });

      await tx.job.update({
        where: { id: bid.jobId },
        data: { status: JobStatus.AWARDED },
      });

      const booking = await tx.booking.create({
        data: {
          serviceId: service.id,
          providerId: bid.providerId,
          seekerId: bid.job.seekerId,
          serviceTitle: bid.job.title,
          address: bid.job.address,
          lat: bid.job.lat,
          lng: bid.job.lng,
          requestedAt: bid.job.requestedAt,
          note: noteParts.join(' '),
          status: BookingStatus.ACCEPTED,
        },
        include: { seeker: true },
      });

      const notification = await tx.notification.create({
        data: {
          providerId: bid.providerId,
          type: 'bid_accepted',
          title: 'Your bid was accepted',
          body: `${seekerName} accepted your $${bid.price.toFixed(0)} bid on “${bid.job.title}”. It’s now booked.`,
          href: `/provider/bookings/${booking.id}`,
        },
      });

      return { accepted, booking, notification };
    });

    const bidResponse = this.toResponse(result.accepted);
    const bookingResponse = this.toBookingResponse(result.booking);
    const notificationResponse = this.toNotificationResponse(
      result.notification,
    );

    const allBids = await this.listBidsForJob(bid.jobId);
    this.biddingGateway.emitBidsUpdated(bid.jobId, allBids);
    this.biddingGateway.emitBidAccepted(bid.providerId, {
      bid: bidResponse,
      booking: bookingResponse,
      notification: notificationResponse,
    });

    return {
      bid: bidResponse,
      booking: bookingResponse,
      notification: notificationResponse,
    };
  }

  /** Bids on a job — only for the seeker who posted that job. */
  async findForJobAsSeeker(
    jobId: string,
    user: JwtPayload,
  ): Promise<BiddingResponse[]> {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can view bids on their jobs.');
    }

    const job = await this.requireJob(jobId);
    if (job.seekerId !== user.sub) {
      throw new ForbiddenException(
        'You can only view bids on jobs you posted.',
      );
    }

    return this.listBidsForJob(job.id);
  }

  /** Provider’s own bid on a job. */
  async findMyBidOnJob(
    jobId: string,
    user: JwtPayload,
  ): Promise<BiddingResponse> {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can view their bids.');
    }

    const provider = await this.requireProvider(user.sub);
    await this.requireJob(jobId);

    const bid = await this.prisma.bidding.findUnique({
      where: {
        jobId_providerId: {
          jobId,
          providerId: provider.id,
        },
      },
      include: {
        provider: { include: { user: true } },
      },
    });

    if (!bid) {
      throw new NotFoundException('No bid found for this job.');
    }

    return this.toResponse(bid);
  }

  private assertCanAcceptJob(job: Job, user: JwtPayload) {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only the seeker can accept a bid.');
    }
    if (job.seekerId !== user.sub) {
      throw new ForbiddenException(
        'You can only accept bids on jobs you posted.',
      );
    }
  }

  private async listBidsForJob(jobId: string): Promise<BiddingResponse[]> {
    const rows = await this.prisma.bidding.findMany({
      where: { jobId },
      include: {
        provider: { include: { user: true } },
      },
      orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  private async requireJob(jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    return job;
  }

  private async requireProvider(userId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!provider) {
      throw new UnauthorizedException('Provider profile not found.');
    }
    return provider;
  }

  private async requireVerifiedProvider(userId: string) {
    const provider = await this.requireProvider(userId);
    if (provider.user.status !== AccountStatus.VERIFIED) {
      throw new ForbiddenException(
        'Only verified providers can place bids on jobs.',
      );
    }
    return provider;
  }

  private toResponse(bid: BiddingWithProvider): BiddingResponse {
    return {
      id: bid.id,
      jobId: bid.jobId,
      providerId: bid.providerId,
      providerName: bid.provider.user.name,
      price: bid.price,
      note: bid.note,
      status: this.mapBidStatus(bid.status),
      createdAt: bid.createdAt.toISOString(),
      updatedAt: bid.updatedAt.toISOString(),
    };
  }

  private mapBidStatus(status: BiddingStatus): BiddingStatusDto {
    if (status === BiddingStatus.ACCEPTED) return 'accepted';
    if (status === BiddingStatus.REJECTED) return 'rejected';
    return 'pending';
  }

  private toBookingResponse(booking: {
    id: string;
    serviceId: string;
    providerId: string;
    serviceTitle: string;
    seekerId: string;
    address: string;
    lat: number;
    lng: number;
    requestedAt: Date;
    note: string;
    status: BookingStatus;
    providerViewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    seeker: User;
  }): BookingResponse {
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      providerId: booking.providerId,
      serviceTitle: booking.serviceTitle,
      seekerId: booking.seekerId,
      seekerName: booking.seeker.name,
      seekerPhone: booking.seeker.phone,
      address: booking.address,
      lat: booking.lat,
      lng: booking.lng,
      requestedAt: booking.requestedAt.toISOString(),
      note: booking.note,
      status: this.mapBookingStatus(booking.status),
      providerViewedAt: booking.providerViewedAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  private toNotificationResponse(row: {
    id: string;
    providerId: string;
    type: string;
    title: string;
    body: string;
    href: string | null;
    read: boolean;
    createdAt: Date;
  }): NotificationResponse {
    return {
      id: row.id,
      providerId: row.providerId,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapBookingStatus(
    status: BookingStatus,
  ): BookingResponse['status'] {
    switch (status) {
      case BookingStatus.NEGOTIATING:
        return 'negotiating';
      case BookingStatus.ACCEPTED:
        return 'accepted';
      case BookingStatus.DECLINED:
        return 'declined';
      case BookingStatus.COMPLETED:
        return 'completed';
      default:
        return 'pending';
    }
  }

}
