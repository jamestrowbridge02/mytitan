import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AutomationsService } from '../automations/automations.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { getPortalControlSettings } from '../common/business-config';
import { summarizeCustomerCollectionReadiness } from '../billing/payment-collection';
import { buildAppUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly automations: AutomationsService,
  ) {}

  private buildPortalUrl(token: string) {
    return buildAppUrl(`/portal/job/${token}`);
  }

  async overview(companyId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const portalControls = getPortalControlSettings(settings);
    const collectionReadiness = summarizeCustomerCollectionReadiness({
      paymentsEnabled: Boolean(settings?.paymentsEnabled || settings?.featurePayments),
      stripeConfigured: this.billing.isStripeConfigured(),
      settings,
    });
    const now = new Date();
    const [jobs, recentActivity] = await Promise.all([
      db.job.findMany({
        where: {
          companyId,
          status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED'] },
        },
        include: {
          publicTokens: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 40,
      }),
      db.auditEvent.findMany({
        where: {
          companyId,
          type: { startsWith: 'portal.' },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    const rows = jobs.map((job: any) => {
      const token = job.publicTokens?.[0] || null;
      const portalState = !token ? 'not_provisioned' : new Date(token.expiresAt).getTime() > now.getTime() ? 'active' : 'expired';
      return {
        commercialState:
          job.invoicePaidAt
            ? 'paid'
            : job.invoiceIssuedAt
            ? Boolean(job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < now.getTime())
              ? 'invoice_overdue'
              : 'invoice_issued'
            : job.status === 'COMPLETED' || job.status === 'INVOICED'
            ? 'invoice_ready'
            : 'pre_invoice',
        nextCustomerStep: job.invoicePaidAt
          ? 'Payment has been recorded.'
          : job.invoiceIssuedAt
          ? Boolean(job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < now.getTime())
            ? 'Customer payment is overdue.'
            : 'Customer can review and pay the issued invoice.'
          : job.status === 'COMPLETED' || job.status === 'INVOICED'
          ? 'Prepare invoice and customer-facing payment guidance.'
          : 'Portal can be used for progress visibility until billing is ready.',
        id: job.id,
        jobRef: job.jobRef,
        customerName: job.customerName,
        status: job.status,
        approvedAt: job.approvedAt,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoiceDueAt: job.invoiceDueAt,
        invoicePaidAt: job.invoicePaidAt,
        portalTokenActive: portalState === 'active',
        portalState,
        portalExpiresAt: token?.expiresAt || null,
        portalUrl: token?.token && portalState === 'active' ? this.buildPortalUrl(token.token) : null,
        invoiceOverdue: Boolean(job.invoiceDueAt && !job.invoicePaidAt && new Date(job.invoiceDueAt).getTime() < now.getTime()),
        paymentReady: Boolean((job.totalCents || 0) > 0 && collectionReadiness.ready),
        paymentSetupLabel: collectionReadiness.label,
        paymentSetupDetail: collectionReadiness.detail,
      };
    });

    return {
      enabled: Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled),
      controls: portalControls,
      paymentsEnabled: Boolean(settings?.paymentsEnabled),
      stripeConfigured: this.billing.isStripeConfigured(),
      paymentSetupLabel: collectionReadiness.label,
      paymentSetupDetail: collectionReadiness.detail,
      summary: {
        activeLinks: rows.filter((row) => row.portalTokenActive).length,
        expiredLinks: rows.filter((row) => row.portalState === 'expired').length,
        awaitingApproval: rows.filter((row) => row.status === 'COMPLETED' && !row.approvedAt).length,
        paymentReady: rows.filter((row) => row.paymentReady).length,
        expiringSoon: rows.filter((row) => row.portalState === 'active' && row.portalExpiresAt && new Date(row.portalExpiresAt).getTime() < now.getTime() + 7 * 24 * 60 * 60 * 1000).length,
      },
      jobs: rows,
      recentActivity: recentActivity.map((event: any) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt,
      })),
    };
  }

  async ensureJobPortal(companyId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId },
      include: {
        publicTokens: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    let token = job.publicTokens?.[0];
    if (!token) {
      token = await db.publicJobToken.create({
        data: {
          jobId: job.id,
          token: randomBytes(24).toString('hex'),
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const portalUrl = this.buildPortalUrl(token.token);
    await db.job.update({
      where: { id: job.id },
      data: { whatsappCompletionLink: portalUrl },
    });
    await this.audit.log(companyId, 'portal.link.ensure', `Portal link prepared for ${job.jobRef}`, userId);
    await this.automations.handlePortalLifecycle(companyId, userId, job, 'ensured', portalUrl, token.expiresAt);

    return {
      jobId: job.id,
      jobRef: job.jobRef,
      portalUrl,
      expiresAt: token.expiresAt,
    };
  }

  async revokeJobPortal(companyId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job not found');

    await db.publicJobToken.updateMany({
      where: { jobId: job.id, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    await db.job.update({
      where: { id: job.id },
      data: { whatsappCompletionLink: null },
    });
    await this.audit.log(companyId, 'portal.link.revoke', `Portal link revoked for ${job.jobRef}`, userId);
    await this.automations.handlePortalLifecycle(companyId, userId, job, 'revoked', null, null);
    return { ok: true };
  }

  async regenerateJobPortal(companyId: string, userId: string, jobId: string) {
    await this.revokeJobPortal(companyId, userId, jobId);
    return this.ensureJobPortal(companyId, userId, jobId);
  }
}
