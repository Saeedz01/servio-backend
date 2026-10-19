import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type NotificationResponse = {
  id: string;
  providerId: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(user: JwtPayload): Promise<NotificationResponse[]> {
    const provider = await this.requireProvider(user);
    const rows = await this.prisma.notification.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async markRead(
    id: string,
    user: JwtPayload,
  ): Promise<NotificationResponse> {
    const provider = await this.requireProvider(user);
    const existing = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found.');
    }
    if (existing.providerId !== provider.id) {
      throw new ForbiddenException('Not your notification.');
    }
    const row = await this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return this.toResponse(row);
  }

  async markAllRead(user: JwtPayload): Promise<{ updated: number }> {
    const provider = await this.requireProvider(user);
    const result = await this.prisma.notification.updateMany({
      where: { providerId: provider.id, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  private async requireProvider(user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers can view notifications.');
    }
    const provider = await this.prisma.provider.findUnique({
      where: { userId: user.sub },
    });
    if (!provider) {
      throw new UnauthorizedException('Provider profile not found.');
    }
    return provider;
  }

  private toResponse(row: {
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
}
