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
  PriceUnit,
  ServiceStatus,
  type Prisma,
  type Service,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateServiceCityDto,
  UpdateServiceCityDto,
} from './dto/city.dto.js';
import type { CreateServiceDto, UpdateServiceDto } from './dto/service.dto.js';

export type ServiceResponse = {
  id: string;
  providerId: string;
  categoryId: string;
  categoryParentId: string | null;
  cityId: string;
  cityName?: string;
  title: string;
  description: string;
  specialty: string | null;
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

export type ServiceCategoryResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  keywords: string[];
  isActive: boolean;
  parentId: string | null;
};

export type ServiceCityResponse = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ServiceWithRelations = Service & {
  provider: { user: { name: string } };
  category?: { parentId: string | null };
  city?: { name: string };
};

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveCategories(opts?: {
    search?: string;
    parentId?: string;
    rootsOnly?: boolean;
  }): Promise<ServiceCategoryResponse[]> {
    const query = opts?.search?.trim();
    const parentId = opts?.parentId?.trim();
    const rootsOnly = Boolean(opts?.rootsOnly);

    const categories = await this.prisma.serviceCategory.findMany({
      where: {
        isActive: true,
        ...(rootsOnly ? { parentId: null } : {}),
        ...(parentId ? { parentId } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        keywords: true,
        isActive: true,
        parentId: true,
      },
    });

    // Keep "Other Services" pinned at the bottom of root lists.
    return categories.sort((a, b) => {
      const aOther =
        a.slug === 'other-services' || a.slug.startsWith('other-services-')
          ? 1
          : 0;
      const bOther =
        b.slug === 'other-services' || b.slug.startsWith('other-services-')
          ? 1
          : 0;
      if (aOther !== bOther) return aOther - bOther;
      return a.name.localeCompare(b.name);
    });
  }

  async findCities(includeInactive = false): Promise<ServiceCityResponse[]> {
    const cities = await this.prisma.serviceCity.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
    return cities.map((city) => this.toCityResponse(city));
  }

  async createCity(dto: CreateServiceCityDto): Promise<ServiceCityResponse> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('City name is required.');
    }
    const slug = this.slugify(name);
    try {
      const city = await this.prisma.serviceCity.create({
        data: { name, slug, isActive: true },
      });
      return this.toCityResponse(city);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('A city with that name already exists.');
      }
      throw error;
    }
  }

  async updateCity(
    id: string,
    dto: UpdateServiceCityDto,
  ): Promise<ServiceCityResponse> {
    const existing = await this.prisma.serviceCity.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('City not found.');
    }

    const name = dto.name?.trim();
    try {
      const city = await this.prisma.serviceCity.update({
        where: { id },
        data: {
          ...(name
            ? {
                name,
                slug: this.slugify(name),
              }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return this.toCityResponse(city);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('A city with that name already exists.');
      }
      throw error;
    }
  }

  async removeCity(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.serviceCity.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('City not found.');
    }

    const usage = await this.prisma.service.count({ where: { cityId: id } });
    if (usage > 0) {
      await this.prisma.serviceCity.update({
        where: { id },
        data: { isActive: false },
      });
      return { ok: true };
    }

    await this.prisma.serviceCity.delete({ where: { id } });
    return { ok: true };
  }

  async create(userId: string, dto: CreateServiceDto): Promise<ServiceResponse> {
    const provider = await this.requireProvider(userId);
    const status = this.resolveCreateStatus(provider.user.status, dto.status);
    const category = await this.requireLeafCategory(dto.categoryId);
    const city = await this.requireActiveCity(dto.cityId);
    const specialty = this.requireSpecialtyIfOther(
      category.slug,
      dto.specialty,
    );

    const service = await this.prisma.service.create({
      data: {
        providerId: provider.id,
        categoryId: category.id,
        cityId: city.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        specialty,
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
      include: {
        provider: { include: { user: true } },
        category: { select: { parentId: true } },
        city: { select: { name: true } },
      },
    });

    return this.toResponse(service);
  }

  async findMine(userId: string): Promise<ServiceResponse[]> {
    const provider = await this.requireProvider(userId);
    const services = await this.prisma.service.findMany({
      where: { providerId: provider.id },
      include: {
        provider: { include: { user: true } },
        category: { select: { parentId: true } },
        city: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return services.map((service) => this.toResponse(service));
  }

  async findPublished(filters?: {
    cityId?: string;
    categoryId?: string;
  }): Promise<ServiceResponse[]> {
    const cityId = filters?.cityId?.trim();
    const categoryId = filters?.categoryId?.trim();

    const services = await this.prisma.service.findMany({
      where: {
        status: ServiceStatus.PUBLISHED,
        ...(cityId ? { cityId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        provider: { include: { user: true } },
        category: { select: { parentId: true } },
        city: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return services.map((service) => this.toResponse(service));
  }

  async findOne(id: string): Promise<ServiceResponse> {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        provider: { include: { user: true } },
        category: { select: { parentId: true } },
        city: { select: { name: true } },
      },
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

    const nextCategoryId = dto.categoryId ?? existing.categoryId;
    const category = await this.requireLeafCategory(nextCategoryId);
    const nextCityId = dto.cityId ?? existing.cityId;
    const city = await this.requireActiveCity(nextCityId);
    const specialty =
      dto.specialty !== undefined || dto.categoryId !== undefined
        ? this.requireSpecialtyIfOther(
            category.slug,
            dto.specialty !== undefined
              ? dto.specialty
              : (existing.specialty ?? undefined),
          )
        : undefined;

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: category.id } : {}),
        ...(dto.cityId !== undefined ? { cityId: city.id } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(specialty !== undefined ? { specialty } : {}),
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
      include: {
        provider: { include: { user: true } },
        category: { select: { parentId: true } },
        city: { select: { name: true } },
      },
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

  private async requireLeafCategory(rawCategoryId: string) {
    const categoryId = rawCategoryId.trim();
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, isActive: true },
      select: {
        id: true,
        slug: true,
        parentId: true,
        _count: { select: { children: true } },
      },
    });
    if (!category) {
      throw new BadRequestException('Select a valid service category.');
    }
    const isLeaf = category.parentId !== null || category._count.children === 0;
    if (!isLeaf) {
      throw new BadRequestException(
        'Select a subcategory for this service listing.',
      );
    }
    return category;
  }

  private async requireActiveCity(rawCityId: string) {
    const cityId = rawCityId.trim();
    const city = await this.prisma.serviceCity.findFirst({
      where: { id: cityId, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    if (!city) {
      throw new BadRequestException('Select a valid city.');
    }
    return city;
  }

  private requireSpecialtyIfOther(
    categorySlug: string,
    rawSpecialty?: string,
  ): string | null {
    const specialty = rawSpecialty?.trim() || null;
    const isOther =
      categorySlug === 'other-services' ||
      categorySlug.startsWith('other-services-');
    if (isOther) {
      if (!specialty) {
        throw new BadRequestException(
          'Describe your specialty when selecting Other Services.',
        );
      }
      return specialty;
    }
    return specialty;
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

  private toResponse(service: ServiceWithRelations): ServiceResponse {
    return {
      id: service.id,
      providerId: service.providerId,
      categoryId: service.categoryId,
      categoryParentId: service.category?.parentId ?? null,
      cityId: service.cityId,
      cityName: service.city?.name,
      title: service.title,
      description: service.description,
      specialty: service.specialty,
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

  private toCityResponse(city: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ServiceCityResponse {
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      isActive: city.isActive,
      createdAt: city.createdAt.toISOString(),
      updatedAt: city.updatedAt.toISOString(),
    };
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
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

  private mapAvailability(
    value: Prisma.JsonValue,
  ): ServiceResponse['availability'] {
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
