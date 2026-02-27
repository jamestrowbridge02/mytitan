import { Injectable } from '@nestjs/common';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(tenantId: string) {
    const db = this.prisma as any;
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const usage = await db.usageMeter.findUnique({
      where: { tenantId_periodStart: { tenantId, periodStart } },
    });

    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    const plan = subscription?.plan ?? (await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } }));
    const features = (plan?.featuresJson ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].features) as Record<string, any>;

    return {
      periodStart,
      usage: usage ?? {
        aiRequestsUsed: 0,
        aiTokensUsed: 0,
        storageBytesUsed: 0,
        jobsCreatedCount: 0,
      },
      limits: {
        aiRequestsLimitMonthly: plan?.aiRequestsLimitMonthly ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].aiRequestsLimitMonthly,
        aiTokensLimitMonthly: plan?.aiTokensLimitMonthly ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].aiTokensLimitMonthly,
        storageBytesLimit: features.storage_bytes_limit ?? null,
        jobsCreatedLimit: features.jobs_created_limit ?? null,
      },
    };
  }
}
