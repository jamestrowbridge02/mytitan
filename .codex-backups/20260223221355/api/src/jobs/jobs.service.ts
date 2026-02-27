import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JobStatus } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto';

const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: [],
};

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private computeTotals(input: { laborCents: number; partsCents: number; miscCents: number; taxRateBps: number }, currency: string) {
    const subtotalCents = input.laborCents + input.partsCents + input.miscCents;
    const taxCents = Math.round((subtotalCents * input.taxRateBps) / 10000);
    const totalCents = subtotalCents + taxCents;

    return {
      laborCents: input.laborCents,
      partsCents: input.partsCents,
      miscCents: input.miscCents,
      subtotalCents,
      taxRateBps: input.taxRateBps,
      taxCents,
      totalCents,
      currency,
    };
  }

  private async nextJobRef(tx: any, companyId: string) {
    const year = new Date().getUTCFullYear();

    try {
      const counter = await tx.invoiceCounter.upsert({
        where: { companyId_year: { companyId, year } },
        update: { current: { increment: 1 } },
        create: { companyId, year, current: 1 },
      });
      return `JOB-${year}-${String(counter.current).padStart(5, '0')}`;
    } catch {
      const counter = await tx.invoiceCounter.upsert({
        where: { companyId },
        update: { nextNumber: { increment: 1 } },
        create: { companyId, prefix: `JOB-${year}`, nextNumber: 1 },
      });
      return `${counter.prefix}-${String(counter.nextNumber).padStart(5, '0')}`;
    }
  }

  async create(companyId: string, userId: string, dto: CreateJobDto) {
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (dto.locationId && db.location) {
      const location = await db.location.findFirst({ where: { id: dto.locationId, companyId } });
      if (!location) {
        throw new BadRequestException('Invalid location for this company');
      }
    }

    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });

    const laborCents = dto.laborCents ?? 0;
    const partsCents = dto.partsCents ?? 0;
    const miscCents = dto.miscCents ?? 0;
    const taxRateBps =
      dto.taxRateBps ??
      (settings?.vatEnabledDefault ? Number(settings.vatRateBpsDefault ?? 0) : 0);
    const currency = settings?.defaultCurrency ?? company.currency ?? 'USD';
    const serviceName =
      dto.serviceName ??
      (Array.isArray(settings?.defaultServiceNamePresets) && settings.defaultServiceNamePresets.length > 0
        ? settings.defaultServiceNamePresets[0]
        : null);
    const wheelPricingMode = dto.wheelPricingMode ?? settings?.defaultWheelPricingMode ?? null;
    const whatsappTemplate = dto.whatsappTemplate ?? settings?.whatsappTemplateDefault ?? null;

    const totals = this.computeTotals({ laborCents, partsCents, miscCents, taxRateBps }, currency);

    const created = await db.$transaction(async (tx: any) => {
      const jobRef = await this.nextJobRef(tx, companyId);
      try {
        return await tx.job.create({
          data: {
            companyId,
            locationId: dto.locationId,
            jobRef,
            status: 'OPEN',
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            vehicleMake: dto.vehicleMake,
            vehicleModel: dto.vehicleModel,
            vehicleReg: dto.vehicleReg,
            serviceName,
            wheelPricingMode,
            whatsappTemplate,
            invoiceDueAt: dto.invoiceDueAt ? new Date(dto.invoiceDueAt) : null,
            ...totals,
          },
        });
      } catch {
        return await tx.job.create({
          data: {
            companyId,
            title: dto.customerName,
            description: dto.vehicleReg ?? null,
            status: 'OPEN',
          },
        });
      }
    });

    await this.audit.log(companyId, 'job.create', `Created job ${created.jobRef ?? created.id}`, userId);

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    try {
      await db.usageMeter.upsert({
        where: { tenantId_periodStart: { tenantId: companyId, periodStart } },
        update: { jobsCreatedCount: { increment: 1 } },
        create: {
          tenantId: companyId,
          periodStart,
          jobsCreatedCount: 1,
        },
      });
    } catch {
      // Non-critical usage tracking
    }

    return created;
  }

  list(companyId: string) {
    const db = this.prisma as any;
    return db.job.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, id: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async updateStatus(companyId: string, userId: string, id: string, newStatus: JobStatus) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id, companyId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === newStatus) {
      return job;
    }

    const allowed = (JOB_STATUS_TRANSITIONS[job.status as JobStatus] ?? []) as JobStatus[];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid status transition: ${job.status} -> ${newStatus}`);
    }

    let updated;
    try {
      updated = await db.job.update({
        where: { id: job.id },
        data: {
          status: newStatus,
          invoiceIssuedAt: newStatus === 'INVOICED' ? new Date() : job.invoiceIssuedAt,
        },
      });
    } catch {
      updated = await db.job.update({ where: { id: job.id }, data: { status: newStatus } });
    }

    await this.audit.log(companyId, 'job.status', `Job ${job.jobRef ?? job.id} status changed ${job.status} -> ${newStatus}`, userId);

    return updated;
  }
}
