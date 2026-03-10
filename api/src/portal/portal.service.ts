import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private buildPortalUrl(token: string) {
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    return `${appUrl}/portal/job/${token}`;
  }

  async overview(companyId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const now = new Date();
    const [jobs, recentActivity] = await Promise.all([
      db.job.findMany({
        where: {
          companyId,
          status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED'] },
        },
        include: {
          publicTokens: {
            where: { expiresAt: { gt: now } },
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
      return {
        id: job.id,
        jobRef: job.jobRef,
        customerName: job.customerName,
        status: job.status,
        approvedAt: job.approvedAt,
        invoiceIssuedAt: job.invoiceIssuedAt,
        invoicePaidAt: job.invoicePaidAt,
        portalTokenActive: Boolean(token),
        portalExpiresAt: token?.expiresAt || null,
        portalUrl: token?.token ? this.buildPortalUrl(token.token) : null,
        paymentReady: Boolean(settings?.paymentsEnabled && this.billing.isStripeConfigured() && (job.totalCents || 0) > 0),
      };
    });

    return {
      enabled: Boolean(settings?.featureCustomerPortal || settings?.paymentsEnabled),
      paymentsEnabled: Boolean(settings?.paymentsEnabled),
      stripeConfigured: this.billing.isStripeConfigured(),
      summary: {
        activeLinks: rows.filter((row) => row.portalTokenActive).length,
        awaitingApproval: rows.filter((row) => row.status === 'COMPLETED' && !row.approvedAt).length,
        paymentReady: rows.filter((row) => row.paymentReady).length,
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
    return { ok: true };
  }

  async regenerateJobPortal(companyId: string, userId: string, jobId: string) {
    await this.revokeJobPortal(companyId, userId, jobId);
    return this.ensureJobPortal(companyId, userId, jobId);
  }
}
