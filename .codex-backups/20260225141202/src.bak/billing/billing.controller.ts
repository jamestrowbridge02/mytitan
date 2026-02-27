import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isAuthSecurityV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSessionDto } from './billing.dto';
import { BillingService } from './billing.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService, private readonly prisma: PrismaService) {}

  private async assertEmailVerified(user: JwtPayload) {
    if (!isAuthSecurityV1Enabled()) return;
    if (user.demoUser || user.email === 'demo@mytitan.co.uk') return;
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
    if (!fullUser?.emailVerified) {
      throw new ForbiddenException('Please verify your email before accessing billing actions.');
    }
  }

  @Post('checkout-session')
  @Roles('OWNER')
  async createCheckout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutSessionDto) {
    await this.assertEmailVerified(user);
    return this.billing.createCheckoutSession(user.companyId, user.sub, dto.planCode, dto.interval);
  }

  @Get('portal')
  @Roles('OWNER')
  async createPortal(@CurrentUser() user: JwtPayload) {
    await this.assertEmailVerified(user);
    return this.billing.createBillingPortal(user.companyId, user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.billing.getBillingInfo(user.companyId);
  }
}

@Controller()
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post(['stripe/webhook', 'billing/webhook'])
  async webhook(@Req() req: Request & { rawBody?: Buffer; body?: unknown }) {
    return this.billing.handleStripeWebhook(req);
  }
}
