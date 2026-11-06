import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Keep Neon from idling while the API process is up (dev / long-lived hosts). */
const KEEP_ALIVE_MS = 4 * 60 * 1000;

/**
 * Neon pooler + Prisma: prefer short connect timeout and pgbouncer-friendly
 * params so cold starts fail fast / retry instead of hanging.
 */
function withNeonTuning(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '10');
    }
    if (
      parsed.hostname.includes('neon.tech') &&
      !parsed.searchParams.has('pgbouncer')
    ) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    if (
      parsed.hostname.includes('neon.tech') &&
      !parsed.searchParams.has('connection_limit')
    ) {
      parsed.searchParams.set('connection_limit', '5');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      throw new Error(
        'DATABASE_URL is not set. Add it in the Vercel project Environment Variables.',
      );
    }
    super({
      datasources: {
        db: { url: withNeonTuning(raw) },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.keepAliveTimer = setInterval(() => {
      void this.$queryRaw`SELECT 1`.catch(() => undefined);
    }, KEEP_ALIVE_MS);
    // Unref so keep-alive does not block process exit in tests / scripts.
    this.keepAliveTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    await this.$disconnect();
  }
}
