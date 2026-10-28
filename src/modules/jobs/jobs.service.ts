import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ContactUnlockTargetType,
  JobStatus,
  type Job,
  type ServiceCategory,
  type User,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BiddingGateway } from '../bidding/bidding.gateway.js';
import { TokensService } from '../tokens/tokens.service.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import { JobMatchingService } from './job-matching.service.js';

export type JobResponse = {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  seekerId: string;
  seekerName: string;
  seekerPhone: string | null;
  contactUnlocked: boolean;
  title: string;
  description: string;
  specialty: string | null;
  address: string;
  lat: number;
  lng: number;
  requestedAt: string;
  status: 'open' | 'awarded' | 'closed';
  createdAt: string;
  updatedAt: string;
};

export type ProviderJobFeedResponse = {
  matched: JobResponse[];
  alsoRelevant: JobResponse[];
};

type JobWithRelations = Job & {
  seeker: User;
  category: ServiceCategory;
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokensService: TokensService,
    private readonly biddingGateway: BiddingGateway,
    private readonly jobMatching: JobMatchingService,
  ) {}

  async create(dto: CreateJobDto, user: JwtPayload): Promise<JobResponse> {
    if (user.role !== 'SEEKER') {
      throw new ForbiddenException('Only seekers can post jobs.');
    }

    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: dto.categoryId.trim(), isActive: true },
    });
    if (!category) {
      throw new BadRequestException('Select a valid service category.');
    }

    const specialty = this.requireSpecialtyIfOther(
      category.slug,
      dto.specialty,
    );

    const requestedAt = new Date(dto.requestedAt);
    if (Number.isNaN(requestedAt.getTime())) {
      throw new BadRequestException('Enter a valid date and time.');
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

    const job = await this.prisma.job.create({
      data: {
        categoryId: category.id,
        seekerId: seeker.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        specialty,
        address: dto.address.trim(),
        lat: dto.lat,
        lng: dto.lng,
        requestedAt,
        status: JobStatus.OPEN,
      },
      include: { seeker: true, category: true },
    });

    const seekerResponse = this.toResponse(job, true);
    const lockedJob = this.toResponse(job, false);
    const matches = await this.jobMatching.providerMatchesForJob({
      id: job.id,
      categoryId: job.categoryId,
      title: job.title,
      description: job.description,
      specialty: job.specialty,
      category: {
        id: job.category.id,
        slug: job.category.slug,
        keywords: job.category.keywords,
      },
    });
    this.biddingGateway.emitJobCreated(matches, { job: lockedJob });

    return seekerResponse;
  }

  async findMineAsSeeker(userId: string): Promise<JobResponse[]> {
    const rows = await this.prisma.job.findMany({
      where: { seekerId: userId },
      include: { seeker: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row, true));
  }

  /**
   * Open jobs partitioned into exact category matches and keyword-relevant ones.
   */
  async findFeedForProvider(
    userId: string,
  ): Promise<ProviderJobFeedResponse> {
    const provider = await this.requireProvider(userId);
    const { matchedIds, alsoRelevantIds } =
      await this.jobMatching.partitionOpenJobsForProvider(provider.id);

    if (matchedIds.length === 0 && alsoRelevantIds.length === 0) {
      return { matched: [], alsoRelevant: [] };
    }

    const allIds = [...matchedIds, ...alsoRelevantIds];
    const rows = await this.prisma.job.findMany({
      where: { id: { in: allIds } },
      include: { seeker: true, category: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const unlocked = await this.tokensService.unlockedTargetIds(
      provider.id,
      ContactUnlockTargetType.JOB,
      allIds,
    );

    const mapIds = (ids: string[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((row): row is JobWithRelations => Boolean(row))
        .map((row) => this.toResponse(row, unlocked.has(row.id)));

    return {
      matched: mapIds(matchedIds),
      alsoRelevant: mapIds(alsoRelevantIds),
    };
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

    if (user.role === 'PROVIDER') {
      const provider = await this.requireProvider(user.sub);
      const unlocked = await this.tokensService.hasUnlock(
        provider.id,
        ContactUnlockTargetType.JOB,
        job.id,
      );
      return this.toResponse(job, unlocked);
    }

    return this.toResponse(job, true);
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
    return this.toResponse(job, true);
  }

  private async assertCanView(job: JobWithRelations, user: JwtPayload) {
    if (user.role === 'SEEKER') {
      if (job.seekerId !== user.sub) {
        throw new ForbiddenException('You can only view your own jobs.');
      }
      return;
    }
    if (user.role === 'PROVIDER') {
      const provider = await this.requireProvider(user.sub);
      if (job.status !== JobStatus.OPEN) {
        throw new ForbiddenException(
          'This job is not available for your published services.',
        );
      }
      const kind = await this.jobMatching.matchKindForProvider(provider.id, {
        id: job.id,
        categoryId: job.categoryId,
        title: job.title,
        description: job.description,
        specialty: job.specialty,
        category: {
          id: job.category.id,
          slug: job.category.slug,
          keywords: job.category.keywords,
        },
      });
      if (!kind) {
        throw new ForbiddenException(
          'This job is not available for your published services.',
        );
      }
      return;
    }
    throw new ForbiddenException('Not allowed to view this job.');
  }

  private requireSpecialtyIfOther(
    categorySlug: string,
    rawSpecialty?: string,
  ): string | null {
    const specialty = rawSpecialty?.trim() || null;
    if (categorySlug === 'other-services') {
      if (!specialty) {
        throw new BadRequestException(
          'Describe your specialty when selecting Other Services.',
        );
      }
      return specialty;
    }
    return specialty;
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
    job: JobWithRelations,
    contactUnlocked: boolean,
  ): JobResponse {
    return {
      id: job.id,
      categoryId: job.categoryId,
      categoryName: job.category.name,
      categorySlug: job.category.slug,
      seekerId: job.seekerId,
      seekerName: job.seeker.name,
      seekerPhone: contactUnlocked ? job.seeker.phone : null,
      contactUnlocked,
      title: job.title,
      description: job.description,
      specialty: job.specialty,
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
}
