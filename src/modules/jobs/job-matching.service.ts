import { Injectable } from '@nestjs/common';
import { JobStatus, ServiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  matchKindForServices,
  pickBookableService,
} from './job-matching.util.js';
import type {
  JobMatchKind,
  MatchableJob,
  MatchableService,
  ProviderJobMatch,
} from './job-matching.types.js';

const serviceSelect = {
  id: true,
  providerId: true,
  categoryId: true,
  title: true,
  description: true,
  specialty: true,
  category: {
    select: {
      id: true,
      slug: true,
      keywords: true,
    },
  },
} as const;

@Injectable()
export class JobMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async publishedServicesForProvider(
    providerId: string,
  ): Promise<MatchableService[]> {
    return this.prisma.service.findMany({
      where: {
        providerId,
        status: ServiceStatus.PUBLISHED,
      },
      select: serviceSelect,
    });
  }

  async matchKindForProvider(
    providerId: string,
    job: MatchableJob,
  ): Promise<JobMatchKind | null> {
    const services = await this.publishedServicesForProvider(providerId);
    return matchKindForServices(job, services);
  }

  async providerCanAccessJob(
    providerId: string,
    job: MatchableJob,
  ): Promise<boolean> {
    if ((job as { status?: JobStatus }).status === JobStatus.CLOSED) {
      return false;
    }
    const kind = await this.matchKindForProvider(providerId, job);
    return kind !== null;
  }

  async pickBookableServiceForProvider(
    providerId: string,
    job: MatchableJob,
  ): Promise<MatchableService | null> {
    const services = await this.publishedServicesForProvider(providerId);
    return pickBookableService(job, services);
  }

  /**
   * Partition all open jobs for a provider into exact vs keyword secondary.
   */
  async partitionOpenJobsForProvider(providerId: string): Promise<{
    matchedIds: string[];
    alsoRelevantIds: string[];
  }> {
    const services = await this.publishedServicesForProvider(providerId);
    if (services.length === 0) {
      return { matchedIds: [], alsoRelevantIds: [] };
    }

    const jobs = await this.prisma.job.findMany({
      where: { status: JobStatus.OPEN },
      select: {
        id: true,
        categoryId: true,
        title: true,
        description: true,
        specialty: true,
        category: {
          select: { id: true, slug: true, keywords: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const matchedIds: string[] = [];
    const alsoRelevantIds: string[] = [];

    for (const job of jobs) {
      const kind = matchKindForServices(job, services);
      if (kind === 'exact') matchedIds.push(job.id);
      else if (kind === 'also_relevant') alsoRelevantIds.push(job.id);
    }

    return { matchedIds, alsoRelevantIds };
  }

  /**
   * Providers who should receive a live alert for this job (once each).
   * Exact match preferred over also_relevant when both apply.
   */
  async providerMatchesForJob(job: MatchableJob): Promise<ProviderJobMatch[]> {
    const services = await this.prisma.service.findMany({
      where: { status: ServiceStatus.PUBLISHED },
      select: serviceSelect,
    });

    const byProvider = new Map<string, MatchableService[]>();
    for (const service of services) {
      const list = byProvider.get(service.providerId) ?? [];
      list.push(service);
      byProvider.set(service.providerId, list);
    }

    const results: ProviderJobMatch[] = [];
    for (const [providerId, providerServices] of byProvider) {
      const matchKind = matchKindForServices(job, providerServices);
      if (matchKind) {
        results.push({ providerId, matchKind });
      }
    }
    return results;
  }
}
