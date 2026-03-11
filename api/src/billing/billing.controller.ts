import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { isAuthSecurityV1Enabled } from '../common/feature-flags';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSessionDto } from './billing.dto';
import { BillingService } from './billing.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertEmailVerified(user: JwtPayload) {
    if (!isAuthSecurityV1Enabled()) return;
    if (user.demoUser || user.email === '@mytitan.co.uk') return;
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
    if (!fullUser?.emailVerified) {
      throw new ForbiddenException('Please verify your email before accessing billing actions.');
    }
  }

  @Post('checkout-session')
  @Roles('OWNER')
  async createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CheckoutSessionDto,
    @Req() req: Request & { requestId?: string },
  ) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPermission({
      user,
      permission: 'billing.manage',
      audit: this.audit,
      requestId,
      action: 'billing.checkout',
    });
    await this.assertEmailVerified(user);
    return this.billing.createCheckoutSession(user.companyId, user.sub, dto.planCode, dto.interval);
  }

  @Get('portal')
  @Roles('OWNER')
  async createPortal(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { requestId?: string },
  ) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPermission({
      user,
      permission: 'billing.manage',
      audit: this.audit,
      requestId,
      action: 'billing.portal',
    });
    await this.assertEmailVerified(user);
    return this.billing.createBillingPortal(user.companyId, user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.billing.getBillingInfo(user.companyId);
  }

  @Get('readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async readiness(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.readiness' });
    return this.billing.getBillingReadiness(user.companyId);
  }

  @Post('jobs/:id/issue-invoice')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async issueInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.issue_invoice' });
    return this.billing.issueInvoice(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/mark-paid')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async markPaid(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.mark_paid' });
    return this.billing.markPaidOffline(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/queue-follow-up')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async queueFollowUp(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.queue_follow_up' });
    return this.billing.queueBillingFollowUp(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/escalate-follow-up')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async escalateFollowUp(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.escalate_follow_up' });
    return this.billing.escalateBillingFollowUp(user.companyId, user.sub, id);
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
