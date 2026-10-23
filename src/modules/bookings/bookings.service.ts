import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingStatus,
  ServiceStatus,
  type Booking,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

export type BookingResponse = {
  id: string;
  serviceId: string;
  providerId: string;
  serviceTitle: string;
  seekerId: string;
  seekerName: string;
  seekerPhone: string;
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
  constructor(private readonly prisma: PrismaService) {}

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

    const booking = await this.prisma.booking.create({
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

    return this.toResponse(booking);
  }

  async findMineAsSeeker(userId: string): Promise<BookingResponse[]> {
    const rows = await this.prisma.booking.findMany({
      where: { seekerId: userId },
      include: { seeker: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findMineAsProvider(userId: string): Promise<BookingResponse[]> {
    const provider = await this.requireProvider(userId);
    const rows = await this.prisma.booking.findMany({
      where: { providerId: provider.id },
      include: { seeker: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Marks accepted bookings as seen when the provider opens the Bookings list
   * (or specific detail). Clears the Bookings-tab unread badge.
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
      status: BookingStatus.ACCEPTED,
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

    if (user.role === 'PROVIDER' && booking.providerViewedAt === null) {
      const viewed = await this.prisma.booking.update({
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
      return this.toResponse(viewed);
    }

    return this.toResponse(booking);
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

    await this.prisma.booking.delete({ where: { id } });
    return { id, deleted: true };
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
    return this.toResponse(booking);
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

  private toResponse(booking: BookingWithSeeker): BookingResponse {
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
