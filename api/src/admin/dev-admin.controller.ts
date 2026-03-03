import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

function isDevAdminEnabled() {
  const enabled = (process.env.MYTITAN_DEV_ADMIN_ENABLED || '').trim().toLowerCase();
  if (process.env.NODE_ENV === 'production') return enabled === 'on' || enabled === 'true' || enabled === '1';
  if (!enabled) return true;
  return enabled === 'on' || enabled === 'true' || enabled === '1';
}

function requireDevAdmin(user: JwtPayload) {
  if (!isDevAdminEnabled()) throw new ForbiddenException('DEV_ADMIN_DISABLED');
  if (!isBillingAllowlisted(user)) throw new ForbiddenException('DEV_ADMIN_FORBIDDEN');
}

function safeFlag(value?: string) {
  const v = (value || '').trim().toLowerCase();
  const on = v === 'on' || v === 'true' || v === '1';
  return on ? 'on' : 'off';
}

@Controller('admin/dev')
export class DevAdminController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    requireDevAdmin(user);

    const companyId = user?.companyId || null;
    const email = user?.email || null;

    const company = companyId
      ? await (this.prisma as any).company.findUnique({
          where: { id: companyId },
          select: { id: true, name: true, timezone: true, currency: true, createdAt: true },
        })
      : null;

    const subscription = companyId
      ? await (this.prisma as any).tenantSubscription.findUnique({
          where: { tenantId: companyId },
          include: { plan: true },
        })
      : null;

    return {
      ok: true,
      user: { email, companyId },
      company,
      subscription,
      billing: { mode: process.env.MYTITAN_BILLING_MODE || 'enforce' },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('health')
  async health(@CurrentUser() user: JwtPayload) {
    requireDevAdmin(user);

    const now = new Date().toISOString();

    // DB ping: lightweight
    let db = { ok: false as boolean };
    try {
      await (this.prisma as any).$queryRaw`SELECT 1`;
      db = { ok: true };
    } catch (e: any) {
      db = { ok: false, error: 'DB_UNAVAILABLE' };
    }

    // Redis ping
    let redis = { ok: false as boolean };
    try {
      const client: any = (this.redis as any)?.client || (this.redis as any)?.getClient?.();
      if (client?.ping) {
        const pong = await client.ping();
        redis = { ok: pong === 'PONG' };
      } else {
        redis = { ok: false, error: 'REDIS_CLIENT_UNAVAILABLE' };
      }
    } catch (e: any) {
      redis = { ok: false, error: 'REDIS_UNAVAILABLE' };
    }

    // Queues: if you have a queue module, extend this later safely
    const queues = { ok: false, status: 'unsupported' as const };

    return { ok: db.ok && redis.ok, now, db, redis, queues };
  }

  @UseGuards(JwtAuthGuard)
  @Get('flags')
  async flags(@CurrentUser() user: JwtPayload, @Query('tenantId') tenantId?: string) {
    requireDevAdmin(user);

    const envFlags = {
      MYTITAN_DEV_ADMIN_ENABLED: safeFlag(process.env.MYTITAN_DEV_ADMIN_ENABLED),
      MYTITAN_BILLING_MODE: (process.env.MYTITAN_BILLING_MODE || 'enforce').trim(),
      MYTITAN_FEATURE_COMMAND_CENTRE: safeFlag(process.env.MYTITAN_FEATURE_COMMAND_CENTRE),
      MYTITAN_FEATURE_CALENDAR_V1: safeFlag(process.env.MYTITAN_FEATURE_CALENDAR_V1),
      MYTITAN_FEATURE_AUTOMATIONS_V1: safeFlag(process.env.MYTITAN_FEATURE_AUTOMATIONS_V1),
      MYTITAN_FEATURE_NOTIFICATIONS_V1: safeFlag(process.env.MYTITAN_FEATURE_NOTIFICATIONS_V1),
    };

    let tenant: any = null;
    if (tenantId) {
      const settings = await (this.prisma as any).tenantSetting.findUnique({
        where: { tenantId },
        select: {
          tenantId: true,
          planId: true,
          planBillingInterval: true,
          bookingsEnabled: true,
          accountingEnabled: true,
          paymentsEnabled: true,
          socialEnabled: true,
          aiEnabled: true,
        },
      });
      tenant = settings || null;
    }

    return { ok: true, envFlags, tenant };
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenant-lookup')
  async tenantLookup(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    requireDevAdmin(user);

    const query = (q || '').trim();
    if (!query || query.length < 2) {
      return { ok: true, query, results: [] as any[] };
    }

    const db = this.prisma as any;

    // Search by company name OR by owner email
    const results = await db.company.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          {
            users: {
              some: {
                role: 'OWNER',
                email: { contains: query, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      select: { id: true, name: true, createdAt: true, timezone: true, currency: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    return { ok: true, query, results };
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenant/:tenantId')
  async tenant(@CurrentUser() user: JwtPayload, @Param('tenantId') tenantId: string) {
    requireDevAdmin(user);

    const db = this.prisma as any;

    const company = await db.company.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, createdAt: true, timezone: true, currency: true },
    });

    if (!company) return { ok: false, error: 'TENANT_NOT_FOUND' };

    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        planId: true,
        planBillingInterval: true,
        bookingsEnabled: true,
        accountingEnabled: true,
        paymentsEnabled: true,
        socialEnabled: true,
        aiEnabled: true,
      },
    });

    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    const owner = await db.user.findFirst({
      where: { companyId: tenantId, role: 'OWNER' },
      select: { id: true, email: true, createdAt: true },
    });

    // Audit log link: keep as a link string, don’t dump logs here
    const appUrl = (process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk').replace(/\/+$/, '');
    const links = {
      audit: `${appUrl}/dashboard/admin/audit?tenantId=${encodeURIComponent(tenantId)}`,
      billing: `${appUrl}/dashboard/billing`,
      settings: `${appUrl}/dashboard/settings`,
    };

    return { ok: true, company, settings, subscription, owner, links };
  }
}
