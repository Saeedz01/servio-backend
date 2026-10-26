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
  ServiceStatus,
  TokenLedgerType,
  type Prisma,
} from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  MONTHLY_TOKEN_GRANT,
  UNLOCK_TOKEN_COST,
  currentMonthKey,
} from './tokens.constants.js';

export type TokenBalanceResponse = {
  balance: number;
  monthKey: string;
  monthlyGrant: number;
  unlockCost: number;
  grantedThisMonth: boolean;
};

export type UnlockContactResponse = {
  unlocked: true;
  alreadyUnlocked: boolean;
  targetType: ContactUnlockTargetType;
  targetId: string;
  balance: number;
  tokensSpent: number;
};

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyBalance(user: JwtPayload): Promise<TokenBalanceResponse> {
    const provider = await this.requireProvider(user);
    const wallet = await this.ensureMonthlyGrant(provider.id);
    const monthKey = currentMonthKey();
    return {
      balance: wallet.balance,
      monthKey,
      monthlyGrant: MONTHLY_TOKEN_GRANT,
      unlockCost: UNLOCK_TOKEN_COST,
      grantedThisMonth: true,
    };
  }

  async unlockContact(
    user: JwtPayload,
    targetType: ContactUnlockTargetType,
    targetIdRaw: string,
  ): Promise<UnlockContactResponse> {
    const provider = await this.requireProvider(user);
    const targetId = targetIdRaw.trim();
    if (!targetId) {
      throw new BadRequestException('targetId is required.');
    }

    await this.assertCanUnlock(provider.id, targetType, targetId);

    const existing = await this.prisma.contactUnlock.findUnique({
      where: {
        providerId_targetType_targetId: {
          providerId: provider.id,
          targetType,
          targetId,
        },
      },
    });
    if (existing) {
      const wallet = await this.ensureMonthlyGrant(provider.id);
      return {
        unlocked: true,
        alreadyUnlocked: true,
        targetType,
        targetId,
        balance: wallet.balance,
        tokensSpent: 0,
      };
    }

    await this.ensureMonthlyGrant(provider.id);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.providerTokenWallet.findUnique({
          where: { providerId: provider.id },
        });
        if (!wallet || wallet.balance < UNLOCK_TOKEN_COST) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Not enough tokens to unlock contact.',
            code: 'INSUFFICIENT_TOKENS',
          });
        }

        const updated = await tx.providerTokenWallet.update({
          where: { providerId: provider.id },
          data: { balance: { decrement: UNLOCK_TOKEN_COST } },
        });

        await tx.contactUnlock.create({
          data: {
            providerId: provider.id,
            targetType,
            targetId,
          },
        });

        await tx.providerTokenLedger.create({
          data: {
            providerId: provider.id,
            type: TokenLedgerType.SPEND_UNLOCK,
            amount: -UNLOCK_TOKEN_COST,
            balanceAfter: updated.balance,
            refType: targetType,
            refId: targetId,
          },
        });

        return updated;
      });

      return {
        unlocked: true,
        alreadyUnlocked: false,
        targetType,
        targetId,
        balance: result.balance,
        tokensSpent: UNLOCK_TOKEN_COST,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const wallet = await this.ensureMonthlyGrant(provider.id);
        return {
          unlocked: true,
          alreadyUnlocked: true,
          targetType,
          targetId,
          balance: wallet.balance,
          tokensSpent: 0,
        };
      }
      throw error;
    }
  }

  async hasUnlock(
    providerId: string,
    targetType: ContactUnlockTargetType,
    targetId: string,
  ): Promise<boolean> {
    const row = await this.prisma.contactUnlock.findUnique({
      where: {
        providerId_targetType_targetId: {
          providerId,
          targetType,
          targetId,
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async unlockedTargetIds(
    providerId: string,
    targetType: ContactUnlockTargetType,
    targetIds: string[],
  ): Promise<Set<string>> {
    if (targetIds.length === 0) return new Set();
    const rows = await this.prisma.contactUnlock.findMany({
      where: {
        providerId,
        targetType,
        targetId: { in: targetIds },
      },
      select: { targetId: true },
    });
    return new Set(rows.map((row) => row.targetId));
  }

  /**
   * When a job bid becomes a booking, copy a job unlock onto the booking
   * so the provider is not charged twice for the same lead.
   */
  async inheritJobUnlockToBooking(
    providerId: string,
    jobId: string,
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const jobUnlock = await db.contactUnlock.findUnique({
      where: {
        providerId_targetType_targetId: {
          providerId,
          targetType: ContactUnlockTargetType.JOB,
          targetId: jobId,
        },
      },
    });
    if (!jobUnlock) return;

    await db.contactUnlock.upsert({
      where: {
        providerId_targetType_targetId: {
          providerId,
          targetType: ContactUnlockTargetType.BOOKING,
          targetId: bookingId,
        },
      },
      create: {
        providerId,
        targetType: ContactUnlockTargetType.BOOKING,
        targetId: bookingId,
      },
      update: {},
    });
  }

  async assertBookingContactUnlocked(
    providerId: string,
    bookingId: string,
  ): Promise<void> {
    const unlocked = await this.hasUnlock(
      providerId,
      ContactUnlockTargetType.BOOKING,
      bookingId,
    );
    if (!unlocked) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Unlock seeker contact with 1 token to chat.',
        code: 'CONTACT_LOCKED',
      });
    }
  }

  async ensureMonthlyGrant(providerId: string) {
    const monthKey = currentMonthKey();

    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.providerTokenWallet.findUnique({
        where: { providerId },
      });
      if (!wallet) {
        wallet = await tx.providerTokenWallet.create({
          data: { providerId, balance: 0 },
        });
      }

      const alreadyGranted = await tx.providerTokenLedger.findFirst({
        where: {
          providerId,
          type: TokenLedgerType.GRANT_MONTHLY,
          monthKey,
        },
        select: { id: true },
      });
      if (alreadyGranted) {
        return wallet;
      }

      const updated = await tx.providerTokenWallet.update({
        where: { providerId },
        data: { balance: { increment: MONTHLY_TOKEN_GRANT } },
      });

      await tx.providerTokenLedger.create({
        data: {
          providerId,
          type: TokenLedgerType.GRANT_MONTHLY,
          amount: MONTHLY_TOKEN_GRANT,
          balanceAfter: updated.balance,
          monthKey,
        },
      });

      return updated;
    });
  }

  private async assertCanUnlock(
    providerId: string,
    targetType: ContactUnlockTargetType,
    targetId: string,
  ) {
    if (targetType === ContactUnlockTargetType.BOOKING) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: targetId },
        select: { providerId: true },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found.');
      }
      if (booking.providerId !== providerId) {
        throw new ForbiddenException('You can only unlock your own bookings.');
      }
      return;
    }

    const job = await this.prisma.job.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, categoryId: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found.');
    }
    if (job.status !== JobStatus.OPEN) {
      throw new ForbiddenException('Only open jobs can be unlocked.');
    }

    const published = await this.prisma.service.findFirst({
      where: {
        providerId,
        status: ServiceStatus.PUBLISHED,
        categoryId: job.categoryId,
      },
      select: { id: true },
    });
    if (!published) {
      throw new ForbiddenException(
        'This job is not available for your published service categories.',
      );
    }
  }

  private async requireProvider(user: JwtPayload) {
    if (user.role !== 'PROVIDER') {
      throw new ForbiddenException('Only providers have token balances.');
    }
    const provider = await this.prisma.provider.findUnique({
      where: { userId: user.sub },
    });
    if (!provider) {
      throw new UnauthorizedException('Provider profile not found.');
    }
    return provider;
  }
}
