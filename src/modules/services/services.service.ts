import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountStatus,
  PriceUnit,
  ServiceStatus,
  type Prisma,
  type Service,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateServiceDto, UpdateServiceDto } from './dto/service.dto.js';

export type ServiceResponse = {
  id: string;
  providerId: string;
  categoryId: string;
  title: string;
  description: string;
  imageUrl: string;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  priceAmount: number;
  priceUnit: 'project' | 'hour' | 'flat';
  availability: Array<{
    day: string;
    enabled: boolean;
    start: string;
    end: string;
  }>;
  status: 'draft' | 'published' | 'suspended';
  createdAt: string;
  updatedAt: string;
  providerName?: string;
};

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateServiceDto): Promise<ServiceResponse> {
    const provider = await this.requireProvider(userId);
    const status = this.resolveCreateStatus(provider.user.status, dto.status);

    const service = await this.prisma.service.create({
      data: {
        providerId: provider.id,
        categoryId: dto.categoryId.trim(),
        title: dto.title.trim(),
        description: dto.description.trim(),
        imageUrl: dto.imageUrl,
        address: dto.address.trim(),
        lat: dto.lat,
        lng: dto.lng,
        radiusKm: dto.radiusKm,
        priceAmount: dto.priceAmount,
        priceUnit: dto.priceUnit,
        availability: dto.availability as unknown as Prisma.InputJsonValue,
        status,
      },
      include: { provider: { include: { user: true } } },
    });

    return this.toResponse(service);
  }

  async findMine(userId: string): Promise<ServiceResponse[]> {
    const provider = await this.requireProvider(userId);
    const services = await this.prisma.service.findMany({
      where: { providerId: provider.id },
      include: { provider: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return services.map((service) => this.toResponse(service));
  }

  async findPublished(): Promise<ServiceResponse[]> {
    const services = await this.prisma.service.findMany({
      where: { status: ServiceStatus.PUBLISHED },
      include: { provider: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return services.map((service) => this.toResponse(service));
  }

  async findOne(id: string): Promise<ServiceResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: { provider: { include: { user: true } } },
    });
    if (!service) {
      throw new NotFoundException('Service not found.');
    }
    return this.toResponse(service);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateServiceDto,
  ): Promise<ServiceResponse> {
    const provider = await this.requireProvider(userId);
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Service not found.');
    }
    if (existing.providerId !== provider.id) {
      throw new ForbiddenException('You can only update your own services.');
    }

    if (
      dto.status === ServiceStatus.PUBLISHED &&
      provider.user.status !== AccountStatus.VERIFIED
    ) {
      throw new ForbiddenException(
        'Only verified providers can publish services.',
      );
    }

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId.trim() }
          : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
        ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
        ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
        ...(dto.radiusKm !== undefined ? { radiusKm: dto.radiusKm } : {}),
        ...(dto.priceAmount !== undefined
          ? { priceAmount: dto.priceAmount }
          : {}),
        ...(dto.priceUnit !== undefined ? { priceUnit: dto.priceUnit } : {}),
        ...(dto.availability !== undefined
          ? {
              availability:
                dto.availability as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { provider: { include: { user: true } } },
    });

    return this.toResponse(service);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const provider = await this.requireProvider(userId);
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Service not found.');
    }
    if (existing.providerId !== provider.id) {
      throw new ForbiddenException('You can only delete your own services.');
    }

    await this.prisma.service.delete({ where: { id } });
    return { ok: true };
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

  private resolveCreateStatus(
    providerStatus: AccountStatus,
    requested?: ServiceStatus,
  ): ServiceStatus {
    if (providerStatus !== AccountStatus.VERIFIED) {
      return ServiceStatus.DRAFT;
    }
    return requested ?? ServiceStatus.DRAFT;
  }

  private toResponse(
    service: Service & {
      provider: { user: { name: string } };
    },
  ): ServiceResponse {
    return {
      id: service.id,
      providerId: service.providerId,
      categoryId: service.categoryId,
      title: service.title,
      description: service.description,
      imageUrl: service.imageUrl,
      address: service.address,
      lat: service.lat,
      lng: service.lng,
      radiusKm: service.radiusKm,
      priceAmount: service.priceAmount,
      priceUnit: this.mapPriceUnit(service.priceUnit),
      availability: this.mapAvailability(service.availability),
      status: this.mapStatus(service.status),
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
      providerName: service.provider.user.name,
    };
  }

  private mapPriceUnit(unit: PriceUnit): ServiceResponse['priceUnit'] {
    switch (unit) {
      case PriceUnit.HOUR:
        return 'hour';
      case PriceUnit.FLAT:
        return 'flat';
      default:
        return 'project';
    }
  }

  private mapStatus(status: ServiceStatus): ServiceResponse['status'] {
    switch (status) {
      case ServiceStatus.PUBLISHED:
        return 'published';
      case ServiceStatus.SUSPENDED:
        return 'suspended';
      default:
        return 'draft';
    }
  }

  private mapAvailability(value: Prisma.JsonValue): ServiceResponse['availability'] {
    if (!Array.isArray(value)) return [];
    return value.map((slot) => {
      const item = slot as {
        day?: string;
        enabled?: boolean;
        start?: string;
        end?: string;
      };
      return {
        day: item.day ?? '',
        enabled: Boolean(item.enabled),
        start: item.start ?? '09:00',
        end: item.end ?? '17:00',
      };
    });
  }
}
