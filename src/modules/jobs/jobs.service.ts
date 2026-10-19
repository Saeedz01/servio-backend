import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  JobStatus,
  ServiceStatus,
  type Job,
  type ServiceCategory,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import type { GuestLookupDto } from './dto/guest-lookup.dto.js';

export type JobResponse = {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  seekerId: string | null;
  seekerName: string;
  seekerPhone: string;
  title: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  requestedAt: string;
  status: 'open' | 'awarded' | 'closed';
  createdAt: string;
  updatedAt: string;
};

type JobWithRelations = Job & {
  seeker: User | null;
  category: ServiceCategory;
};

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateJobDto, user?: JwtPayload): Promise<JobResponse> {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: dto.categoryId.trim(), isActive: true },
    });
    if (!category) {
      throw new BadRequestException('Select a valid service category.');
    }

    const requestedAt = new Date(dto.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('Enter a valid date and time.');
    }
    if (requestedAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Pick a time in the future.');
    }

    let seekerId: string | null = null;
    let guestName: string | null = null;
    let guestPhone: string | null = null;

    if (user) {
      if (user.role !== 'SEEKER') {
        throw new ForbiddenException('Only seekers can post jobs.');
      }
      seekerId = user.sub;
    } else {
      const name = dto.guestName?.trim() ?? '';
      const phone = this.normalizePhone(dto.guestPhone ?? '');
      if (!name) {
        throw new BadRequestException('Enter your name.');
      }
      if (!phone || phone.length < 8) {
        throw new BadRequestException('Enter a valid phone number.');
      }
      guestName = name;
      guestPhone = phone;
    }

    const job = await this.prisma.job.create({
      data: {
        categoryId: category.id,
        seekerId,
        guestName,
        guestPhone,
        title: dto.title.trim(),
        description: dto.description.trim(),
        address: dto.address.trim(),
        lat: dto.lat,
        lng: dto.lng,
        requestedAt,
        status: JobStatus.OPEN,
      },
      include: { seeker: true, category: true },
    });

    return this.toResponse(job);
  }

  async findMineAsSeeker(userId: string): Promise<JobResponse[]> {
    const rows = await this.prisma.job.findMany({
      where: { seekerId: userId },
      include: { seeker: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async guestLookup(dto: GuestLookupDto): Promise<JobResponse[]> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone || phone.length < 8) {
      throw new BadRequestException('Enter a valid phone number.');
    }

    const name = dto.name?.trim();
    const rows = await this.prisma.job.findMany({
      where: {
        seekerId: null,
        guestPhone: phone,
        ...(name
          ? { guestName: { equals: name, mode: 'insensitive' as const } }
          : {}),
      },
      include: { seeker: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Open jobs whose category matches at least one of the provider's
   * published (active) services.
   */
  async findFeedForProvider(userId: string): Promise<JobResponse[]> {
    const provider = await this.requireProvider(userId);
    const categoryIds = await this.publishedCategoryIds(provider.id);
    if (categoryIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.job.findMany({
      where: {
        status: JobStatus.OPEN,
        categoryId: { in: categoryIds },
      },
      include: { seeker: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(id: string, user: JwtPayload): Promise<JobResponse> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { seeker: true, category: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    await this.assertCanView(job, user);
    return this.toResponse(job);
  }

  async close(id: string, userId: string): Promise<JobResponse> {
    const existing = await this.prisma.job.findUnique({
      where: { id },
      include: { seeker: true, category: true },
    });
    if (!existing) {
      throw new NotFoundException('Job not found.');
    }
    if (existing.seekerId !== userId) {
      throw new ForbiddenException('You can only close your own jobs.');
    }
    if (existing.status !== JobStatus.OPEN) {
      throw new BadRequestException('Only open jobs can be closed.');
    }

    const job = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.CLOSED },
      include: { seeker: true, category: true },
    });
    return this.toResponse(job);
  }

  private async assertCanView(job: Job, user: JwtPayload) {
    if (user.role === 'SEEKER') {
      if (job.seekerId !== user.sub) {
        throw new ForbiddenException('You can only view your own jobs.');
      }
      return;
    }
    if (user.role === 'PROVIDER') {
      const provider = await this.requireProvider(user.sub);
      const categoryIds = await this.publishedCategoryIds(provider.id);
      if (
        job.status !== JobStatus.OPEN ||
        !categoryIds.includes(job.categoryId)
      ) {
        throw new ForbiddenException(
          'This job is not available for your published service categories.',
        );
      }
      return;
    }
    throw new ForbiddenException('Not allowed to view this job.');
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

  private async requireProvider(userId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
    });
    if (!provider) {
      throw new UnauthorizedException('Provider profile not found.');
    }
    return provider;
  }

  private toResponse(job: JobWithRelations): JobResponse {
    return {
      id: job.id,
      categoryId: job.categoryId,
      categoryName: job.category.name,
      categorySlug: job.category.slug,
      seekerId: job.seekerId,
      seekerName: job.seeker?.name ?? job.guestName ?? '',
      seekerPhone: job.seeker?.phone ?? job.guestPhone ?? '',
      title: job.title,
      description: job.description,
      address: job.address,
      lat: job.lat,
      lng: job.lng,
      requestedAt: job.requestedAt.toISOString(),
      status: this.mapStatus(job.status),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private mapStatus(status: JobStatus): JobResponse['status'] {
    switch (status) {
      case JobStatus.AWARDED:
        return 'awarded';
      case JobStatus.CLOSED:
        return 'closed';
      default:
        return 'open';
    }
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, '');
  }
}
