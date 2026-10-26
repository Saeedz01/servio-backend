import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingStatus,
  ContactUnlockTargetType,
  ServiceStatus,
  type Booking,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BiddingGateway } from '../bidding/bidding.gateway.js';
import { TokensService } from '../tokens/tokens.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

export type BookingResponse = {
  id: string;
  serviceId: string;
  providerId: string;
  serviceTitle: string;
  seekerId: string;
  seekerName: string;
  seekerPhone: string | null;
  contactUnlocked: boolean;
  address: string;
  lat: number;
  lng: number;
  requestedAt: string;
  note: string;
  status: 'pending' | 'negotiating' | 'accepted' | 'declined' | 'completed';
  providerViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BookingWithSeeker = Booking & { seeker: User };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokensService: TokensService,
    private readonly biddingGateway: BiddingGateway,
  ) {}

  async create(
    dto: CreateBookingDto,
    user: JwtPayload,
  ): Promise<BookingResponse> {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can create booking requests.');
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId.trim() },
    });
    if (!service || service.status !== ServiceStatus.PUBLISHED) {
      throw new NotFoundException('Published service not found.');
    }

    const requestedAt = new Date(dto.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('Enter a valid requested time.');
    }
    if (requestedAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Pick a time in the future.');
    }

    const seeker = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!seeker) {
      throw new UnauthorizedException('Seeker account not found.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          serviceId: service.id,
          providerId: service.providerId,
          seekerId: seeker.id,
          serviceTitle: service.title,
          address: dto.address.trim(),
          lat: dto.lat,
          lng: dto.lng,
          requestedAt,
          note: dto.note?.trim() ?? '',
          status: BookingStatus.PENDING,
        },
        include: { seeker: true },
      });

      const seekerName = seeker.name.trim() || 'A seeker';
      const notification = await tx.notification.create({
        data: {
          providerId: service.providerId,
          type: 'booking_request',
          title: 'New booking request',
          body: `${seekerName} requested “${service.title}”.`,
          href: `/provider/bookings/${booking.id}`,
        },
      });

      return { booking, notification };
    });

    const seekerResponse = this.toResponse(result.booking, true);
    const providerResponse = this.toResponse(result.booking, false);
    this.biddingGateway.emitBookingCreated(service.providerId, {
      booking: providerResponse,
      notification: {
        id: result.notification.id,
        providerId: result.notification.providerId,
        type: result.notification.type,
        title: result.notification.title,
        body: result.notification.body,
        href: result.notification.href,
        read: result.notification.read,
        createdAt: result.notification.createdAt.toISOString(),
      },
    });

    return seekerResponse;
  }

  async findMineAsSeeker(userId: string): Promise<BookingResponse[]> {
    const rows = await this.prisma.booking.findMany({
      where: { seekerId: userId },
      include: { seeker: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row, true));
  }

  async findMineAsProvider(userId: string): Promise<BookingResponse[]> {
    const provider = await this.requireProvider(userId);
    const rows = await this.prisma.booking.findMany({
      where: { providerId: provider.id },
      include: { seeker: true },
      orderBy: { createdAt: 'desc' },
    });
    const unlocked = await this.tokensService.unlockedTargetIds(
      provider.id,
      ContactUnlockTargetType.BOOKING,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.toResponse(row, unlocked.has(row.id)));
  }

  /**
   * Marks pending / negotiating / accepted bookings as seen when the provider
   * opens the Bookings list (or specific detail). Clears the Bookings-tab badge.
   */
  async markSeenAsProvider(
    userId: string,
    bookingIds?: string[],
  ): Promise<{ updated: number }> {
    const provider = await this.requireProvider(userId);
    const ids = (bookingIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean);

    const where = {
      providerId: provider.id,
      providerViewedAt: null,
      status: {
        in: [
          BookingStatus.PENDING,
          BookingStatus.NEGOTIATING,
          BookingStatus.ACCEPTED,
        ],
      },
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    };

    const toMark = await this.prisma.booking.findMany({
      where,
      select: { id: true },
    });
    if (toMark.length === 0) {
      return { updated: 0 };
    }

    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: { id: { in: toMark.map((row) => row.id) } },
      data: { providerViewedAt: now },
    });

    await this.prisma.notification.updateMany({
      where: {
        providerId: provider.id,
        read: false,
        OR: toMark.map((row) => ({
          href: `/provider/bookings/${row.id}`,
        })),
      },
      data: { read: true },
    });

    return { updated: result.count };
  }

  async findOne(id: string, user: JwtPayload): Promise<BookingResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { seeker: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }
    await this.assertCanView(booking, user);

    let row = booking;
    if (user.role === 'PROVIDER' && booking.providerViewedAt === null) {
      row = await this.prisma.booking.update({
        where: { id: booking.id },
        data: { providerViewedAt: new Date() },
        include: { seeker: true },
      });
      await this.prisma.notification.updateMany({
        where: {
          providerId: booking.providerId,
          href: `/provider/bookings/${booking.id}`,
          read: false,
        },
        data: { read: true },
      });
    }

    const unlocked = await this.resolveContactUnlocked(row, user);
    return this.toResponse(row, unlocked);
  }

  async withdraw(
    id: string,
    user: JwtPayload,
  ): Promise<{ id: string; deleted: true }> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.NEGOTIATING
    ) {
      throw new BadRequestException(
        'Only pending or negotiating requests can be withdrawn.',
      );
    }

    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can withdraw booking requests.');
    }
    if (booking.seekerId !== user.sub) {
      throw new ForbiddenException('You can only withdraw your own requests.');
    }

    const providerId = booking.providerId;
    const bookingId = booking.id;
    const href = `/provider/bookings/${bookingId}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.delete({ where: { id: bookingId } });
      await tx.notification.deleteMany({
        where: {
          providerId,
          href,
        },
      });
    });

    this.biddingGateway.emitBookingWithdrawn(providerId, {
      bookingId,
      providerId,
    });

    return { id: bookingId, deleted: true };
  }

  async updateStatus(
    id: string,
    userId: string,
    status: BookingStatus,
  ): Promise<BookingResponse> {
    if (
      status !== BookingStatus.NEGOTIATING &&
      status !== BookingStatus.ACCEPTED &&
      status !== BookingStatus.DECLINED &&
      status !== BookingStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Status must be negotiating, accepted, declined, or completed.',
      );
    }

    const provider = await this.requireProvider(userId);
    const existing = await this.prisma.booking.findUnique({
      where: { id },
      include: { seeker: true },
    });
    if (!existing) {
      throw new NotFoundException('Booking not found.');
    }
    if (existing.providerId !== provider.id) {
      throw new ForbiddenException('You can only update your own bookings.');
    }

    if (status === BookingStatus.COMPLETED) {
      if (existing.status !== BookingStatus.ACCEPTED) {
        throw new BadRequestException(
          'Only booked bookings can be marked completed.',
        );
      }
    } else if (
      existing.status !== BookingStatus.PENDING &&
      existing.status !== BookingStatus.NEGOTIATING
    ) {
      throw new BadRequestException(
        'Only pending or negotiating bookings can change status.',
      );
    }

    const booking = await this.prisma.booking.update({
      where: { id },
      data: { status },
      include: { seeker: true },
    });
    const unlocked = await this.tokensService.hasUnlock(
      provider.id,
      ContactUnlockTargetType.BOOKING,
      booking.id,
    );
    return this.toResponse(booking, unlocked);
  }

  private async resolveContactUnlocked(
    booking: Booking,
    user: JwtPayload,
  ): Promise<boolean> {
    if (user.role !== 'PROVIDER') {
      return true;
    }
    const provider = await this.requireProvider(user.sub);
    return this.tokensService.hasUnlock(
      provider.id,
      ContactUnlockTargetType.BOOKING,
      booking.id,
    );
  }

  private async assertCanView(booking: Booking, user: JwtPayload) {
    if (user.role === 'SEEKER') {
      if (booking.seekerId !== user.sub) {
        throw new ForbiddenException('You can only view your own bookings.');
      }
      return;
    }
    if (user.role === 'PROVIDER') {
      const provider = await this.requireProvider(user.sub);
      if (booking.providerId !== provider.id) {
        throw new ForbiddenException('You can only view your own bookings.');
      }
      return;
    }
    throw new ForbiddenException('Not allowed to view this booking.');
  }

  private async requireProvider(userId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
    });
    if (!provider) {
      throw new UnauthorizedException('Provider profile not found.');
    }
    return provider;
  }

  private toResponse(
    booking: BookingWithSeeker,
    contactUnlocked: boolean,
  ): BookingResponse {
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      providerId: booking.providerId,
      serviceTitle: booking.serviceTitle,
      seekerId: booking.seekerId,
      seekerName: booking.seeker.name,
      seekerPhone: contactUnlocked ? booking.seeker.phone : null,
      contactUnlocked,
      address: booking.address,
      lat: booking.lat,
      lng: booking.lng,
      requestedAt: booking.requestedAt.toISOString(),
      note: booking.note,
      status: this.mapStatus(booking.status),
      providerViewedAt: booking.providerViewedAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  private mapStatus(status: BookingStatus): BookingResponse['status'] {
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
