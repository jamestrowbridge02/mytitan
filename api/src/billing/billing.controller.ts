import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { isAuthSecurityV1Enabled } from '../common/feature-flags';
import { assertPermission } from '../common/permissions';
import { assertPlatformAdminAccess, isPlatformAdminUser } from '../common/platform-admin';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BillingBalanceAdjustmentDto, CheckoutSessionDto, CustomerPaymentRequestDto, FinanceReportQueryDto, GenerateStatementDto, InvoiceTermsDto, JobCompletionPackCheckoutSessionDto, ManualPaymentRequestPaidDto, PaymentReconciliationReviewDto, PricingAdjustmentDto, RefundBookingDepositDto, RefundPaymentDto, SendStatementDto, UpdatePaymentCollectionDto } from './billing.dto';
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
    if (user.demoUser || isPlatformAdminUser(user)) return;
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

  @Post('job-completion-packs/checkout-session')
  @Roles('OWNER')
  async createJobCompletionPackCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: JobCompletionPackCheckoutSessionDto,
    @Req() req: Request & { requestId?: string },
  ) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPermission({
      user,
      permission: 'billing.manage',
      audit: this.audit,
      requestId,
      action: 'billing.job_completion_pack_checkout',
    });
    await this.assertEmailVerified(user);
    return this.billing.createJobCompletionPackCheckoutSession(user.companyId, user.sub, dto.packCode);
  }

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({
      where: { id: user.sub, companyId: user.companyId },
      select: { emailVerified: true },
    });
    const billingInfo = await this.billing.getBillingInfo(user.companyId);
    return {
      ...billingInfo,
      viewer: {
        role: user.role,
        emailVerified: Boolean(fullUser?.emailVerified),
        canManageSubscription: user.role === 'OWNER',
        canManageCollectionSettings: ['OWNER', 'ADMIN', 'STAFF'].includes(String(user.role || '')),
      },
    };
  }

  @Patch('payment-collection')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async updatePaymentCollection(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePaymentCollectionDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.payment_collection.update' });
    return this.billing.updatePaymentCollectionOptions(user.companyId, user.sub, dto);
  }

  @Get('pricing-state')
  async pricingState(@CurrentUser() user: JwtPayload, @Req() req: Request & { requestId?: string }) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPlatformAdminAccess({ user, audit: this.audit, requestId, action: 'billing.pricing_state' });
    return this.billing.getPricingState(user.companyId);
  }

  @Post('pricing-adjustment')
  async applyPricingAdjustment(@CurrentUser() user: JwtPayload, @Body() dto: PricingAdjustmentDto, @Req() req: Request & { requestId?: string }) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPlatformAdminAccess({ user, audit: this.audit, requestId, action: 'billing.pricing_adjustment_apply' });
    await this.assertEmailVerified(user);
    return this.billing.upsertPricingAdjustment(user.companyId, user.sub, dto);
  }

  @Patch('pricing-adjustment')
  async updatePricingAdjustment(@CurrentUser() user: JwtPayload, @Body() dto: PricingAdjustmentDto, @Req() req: Request & { requestId?: string }) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPlatformAdminAccess({ user, audit: this.audit, requestId, action: 'billing.pricing_adjustment_update' });
    await this.assertEmailVerified(user);
    return this.billing.upsertPricingAdjustment(user.companyId, user.sub, dto);
  }

  @Delete('pricing-adjustment')
  async removePricingAdjustment(@CurrentUser() user: JwtPayload, @Req() req: Request & { requestId?: string }) {
    const requestId = String(req.requestId || req.headers['x-request-id'] || '').trim() || undefined;
    await assertPlatformAdminAccess({ user, audit: this.audit, requestId, action: 'billing.pricing_adjustment_remove' });
    await this.assertEmailVerified(user);
    return this.billing.removePricingAdjustment(user.companyId, user.sub);
  }

  @Get('readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async readiness(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.readiness' });
    return this.billing.getBillingReadiness(user.companyId);
  }

  @Get('customer-payment-readiness')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async customerPaymentReadiness(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.customer_payment_readiness' });
    return this.billing.getTenantPaymentProviderReadiness(user.companyId);
  }

  @Post('customer-payment-readiness/stripe-connect/verify')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async verifyTenantStripeConnect(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.tenant_stripe_connect.verify' });
    return this.billing.verifyTenantStripeConnectReadiness(user.companyId, user.sub);
  }

  @Post('customer-payment-readiness/stripe-connect/test')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async testTenantStripeConnectCheckout(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.tenant_stripe_connect.test_checkout' });
    return this.billing.testTenantStripeConnectCheckoutReadiness(user.companyId, user.sub);
  }

  @Post('customer-payment-readiness/stripe-connect/onboarding')
  @Roles('OWNER', 'ADMIN')
  async createTenantStripeConnectOnboarding(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.tenant_stripe_connect.onboarding' });
    return this.billing.createTenantStripeConnectOnboardingLink(user.companyId, user.sub);
  }

  @Post('customer-payment-readiness/stripe-connect/disconnect')
  @Roles('OWNER', 'ADMIN')
  async disconnectTenantStripeConnect(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.tenant_stripe_connect.disconnect' });
    return this.billing.disconnectTenantStripeConnect(user.companyId, user.sub);
  }

  @Get('finance-report')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async financeReport(@CurrentUser() user: JwtPayload, @Query() query: FinanceReportQueryDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.finance_report' });
    return this.billing.getFinanceReport(user.companyId, query);
  }

  @Post('refund')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async refundPayment(@CurrentUser() user: JwtPayload, @Body() dto: RefundPaymentDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.refund' });
    return this.billing.recordRefund(user.companyId, user.sub, dto);
  }

  @Post('adjustment')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async adjustBilling(@CurrentUser() user: JwtPayload, @Body() dto: BillingBalanceAdjustmentDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.adjustment' });
    return this.billing.recordBalanceAdjustment(user.companyId, user.sub, dto);
  }

  @Post('bookings/:id/deposit-refund')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async refundBookingDeposit(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: RefundBookingDepositDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.booking_deposit_refund' });
    return this.billing.requestBookingDepositRefund(user.companyId, user.sub, id, dto);
  }

  @Post('jobs/:id/issue-invoice')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async issueInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: InvoiceTermsDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.issue_invoice' });
    return this.billing.issueInvoice(user.companyId, user.sub, id, dto?.paymentTermsDays);
  }

  @Patch('jobs/:id/payment-terms')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async updateInvoiceTerms(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: InvoiceTermsDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.invoice_terms.update' });
    return this.billing.updateInvoicePaymentTerms(user.companyId, user.sub, id, Number(dto.paymentTermsDays || 0));
  }

  @Post('jobs/:id/send-invoice')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async sendInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.invoice.send' });
    return this.billing.sendInvoice(user.companyId, user.sub, id);
  }

  @Get('statements')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async statements(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.statement.read' });
    return this.billing.listStatements(user.companyId);
  }

  @Post('statements')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async generateStatement(@CurrentUser() user: JwtPayload, @Body() dto: GenerateStatementDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.statement.generate' });
    return this.billing.generateStatement(user.companyId, user.sub, dto);
  }

  @Post('statements/:id/send')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF')
  async sendStatement(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SendStatementDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.statement.send' });
    return this.billing.sendStatement(user.companyId, user.sub, id, dto?.email);
  }

  @Get('statements/:id/pdf')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async statementPdf(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Res() res: Response) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.statement.pdf' });
    const { statement, pdf } = await this.billing.getStatementPdf(user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${statement.reference}.pdf"`);
    res.send(pdf);
  }

  @Post('jobs/:id/mark-paid')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async markPaid(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.mark_paid' });
    return this.billing.markPaidOffline(user.companyId, user.sub, id);
  }

  @Get('jobs/:id/payment-request')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'TECHNICIAN', 'READ_ONLY')
  async getPaymentRequest(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.customer_payment_request.read' });
    return this.billing.getCustomerPaymentRequest(user.companyId, id);
  }

  @Post('jobs/:id/payment-request')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async createPaymentRequest(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CustomerPaymentRequestDto) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.customer_payment_request.create' });
    return this.billing.createCustomerPaymentRequest(user.companyId, user.sub, id, dto);
  }

  @Post('jobs/:id/payment-request/:requestId/manual-paid')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async markPaymentRequestPaid(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: ManualPaymentRequestPaidDto,
  ) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.customer_payment_request.manual_paid' });
    return this.billing.markCustomerPaymentRequestPaidManually(user.companyId, user.sub, id, requestId, dto);
  }

  @Post('jobs/:id/payment-request/:requestId/review')
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async reviewPaymentRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: PaymentReconciliationReviewDto,
  ) {
    await assertPermission({ user, permission: 'billing.manage', audit: this.audit, action: 'billing.customer_payment_request.review' });
    return this.billing.reviewCustomerPaymentRequest(user.companyId, user.sub, id, requestId, dto);
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

@Controller('billing/customer-payments')
export class CustomerPaymentWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('stripe-connect/webhook')
  @HttpCode(202)
  async stripeConnectWebhook(
    @Req() req: Request & { rawBody?: Buffer; body?: unknown },
  ) {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    return this.billing.handleStripeConnectWebhook(payload, req.headers || {});
  }

  @Post('webhook/:provider/:routeId')
  @HttpCode(202)
  async webhook(
    @Param('provider') provider: string,
    @Param('routeId') routeId: string,
    @Req() req: Request & { rawBody?: Buffer; body?: unknown },
  ) {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    return this.billing.handleTenantPaymentWebhook(provider, routeId, payload, req.headers || {});
  }
}
