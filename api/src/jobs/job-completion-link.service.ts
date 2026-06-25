import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { buildAppUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { JobExecutionService } from './job-execution.service';

@Injectable()
export class JobCompletionLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobExecution: JobExecutionService,
  ) {}

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildRawToken() {
    return `jobfinish_${randomBytes(24).toString('hex')}`;
  }

  private buildUrl(token: string) {
    return buildAppUrl(`/complete/job/${token}`);
  }

  private async resolveJob(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: {
        id: true,
        jobRef: true,
        customerName: true,
        status: true,
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async getStatus(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    const now = new Date();
    const active = await db.jobCompletionQuickLink.findFirst({
      where: {
        tenantId,
        jobId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        tokenPrefix: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
      },
    });

    return {
      jobId: job.id,
      jobRef: job.jobRef || job.id,
      customerName: job.customerName || null,
      jobStatus: job.status || null,
      active: Boolean(active),
      activeLink: active
        ? {
            id: active.id,
            tokenPreview: `${active.tokenPrefix}…`,
            createdAt: active.createdAt,
            expiresAt: active.expiresAt,
            lastUsedAt: active.lastUsedAt || null,
          }
        : null,
    };
  }

  async createLink(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    await db.jobCompletionQuickLink.updateMany({
      where: {
        tenantId,
        jobId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const rawToken = this.buildRawToken();
    const link = await db.jobCompletionQuickLink.create({
      data: {
        tenantId,
        jobId,
        tokenHash: this.tokenHash(rawToken),
        tokenPrefix: rawToken.slice(0, 16),
        issuedByUserId: userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const url = this.buildUrl(rawToken);
    await this.audit.log(tenantId, 'jobs.completion_link.create', `Completion link created for ${job.jobRef || job.id}`, userId);

    return {
      jobId: job.id,
      jobRef: job.jobRef || job.id,
      url,
      expiresAt: link.expiresAt,
      tokenPreview: `${link.tokenPrefix}…`,
    };
  }

  async revokeLink(tenantId: string, userId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    await db.jobCompletionQuickLink.updateMany({
      where: {
        tenantId,
        jobId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    await this.audit.log(tenantId, 'jobs.completion_link.revoke', `Completion link revoked for ${job.jobRef || job.id}`, userId);
    return { ok: true };
  }

  private async resolveActiveLink(rawToken: string) {
    const db = this.prisma as any;
    const link = await db.jobCompletionQuickLink.findFirst({
      where: {
        tokenHash: this.tokenHash(rawToken),
        revokedAt: null,
      },
      include: {
        job: {
          select: {
            id: true,
            companyId: true,
            jobRef: true,
            status: true,
            serviceName: true,
            customerName: true,
            vehicleMake: true,
            vehicleModel: true,
            vehicleReg: true,
          },
        },
      },
    });
    if (!link) {
      throw new NotFoundException('Completion link not found');
    }
    if (link.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Completion link expired');
    }
    return link;
  }

  private async touchLink(id: string) {
    const db = this.prisma as any;
    await db.jobCompletionQuickLink.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async getPublicContext(rawToken: string) {
    const link = await this.resolveActiveLink(rawToken);
    await this.touchLink(link.id);
    const execution = await this.jobExecution.getCompletionWorkspace(link.job.companyId, link.job.id);
    return {
      job: {
        id: link.job.id,
        jobRef: link.job.jobRef || link.job.id,
        status: link.job.status || null,
        serviceName: link.job.serviceName || null,
        customerName: link.job.customerName || null,
        vehicleLabel: [link.job.vehicleMake, link.job.vehicleModel, link.job.vehicleReg].filter(Boolean).join(' ') || null,
      },
      link: {
        expiresAt: link.expiresAt,
      },
      execution,
    };
  }

  async saveFromPublicLink(rawToken: string, input: { summary?: string | null; checklist?: any[]; notesJson?: Record<string, any> | null }) {
    const link = await this.resolveActiveLink(rawToken);
    await this.touchLink(link.id);
    return this.jobExecution.updateExecutionFromCompletionLink(link.job.companyId, link.job.id, input);
  }

  async submitFromPublicLink(
    rawToken: string,
    input: {
      summary?: string | null;
      checklist?: any[];
      notesJson?: Record<string, any> | null;
      evidenceNote?: string | null;
      signatureName?: string | null;
      signatureDataUrl?: string | null;
    },
  ) {
    const link = await this.resolveActiveLink(rawToken);
    await this.touchLink(link.id);
    return this.jobExecution.submitExecutionFromCompletionLink(link.job.companyId, link.job.id, input);
  }
}
