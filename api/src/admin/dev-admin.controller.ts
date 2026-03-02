import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/dev')
export class DevAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
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
        allowlistEmails: (process.env.MYTITAN_BILLING_ALLOWLIST_EMAILS || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };
  }
}
