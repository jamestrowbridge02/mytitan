import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { PrismaService } from '../prisma/prisma.service';

function isDevAdminEnabled() {
  const enabled = (process.env.MYTITAN_DEV_ADMIN_ENABLED || '').trim().toLowerCase();
  if (process.env.NODE_ENV === 'production') return enabled === 'on' || enabled === 'true' || enabled === '1';
  if (!enabled) return true;
  return enabled === 'on' || enabled === 'true' || enabled === '1';
}

@Controller('admin/dev')
export class DevAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    if (!isDevAdminEnabled()) {
      throw new ForbiddenException('DEV_ADMIN_DISABLED');
    }
    if (!isBillingAllowlisted(user)) {
      throw new ForbiddenException('DEV_ADMIN_FORBIDDEN');
    }

    const companyId = user?.companyId || null;
    const email = user?.email || null;

    const company = companyId
      ? await (this.prisma as any).company.findUnique({
          where: { id: companyId },
          select: {
            id: true,
            name: true,
            timezone: true,
            currency: true,
            createdAt: true,
          },
        })
      : null;

    let subscription: any = null;
    try {
      subscription = companyId
        ? await (this.prisma as any).tenantSubscription.findUnique({
            where: { tenantId: companyId },
            include: { plan: true },
          })
        : null;
    } catch {
      subscription = null;
    }

    return {
      ok: true,
      user: { email, companyId },
      company,
      subscription,
      billing: {
        mode: process.env.MYTITAN_BILLING_MODE || 'enforce',
      },
    };
  }
}
