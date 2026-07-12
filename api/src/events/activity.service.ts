import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";

type ActivityEventInput = {
  type: string;
  label: string;
  at?: string;
  tenantId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  customerName?: string | null;
  status?: string | null;
  vehicleReg?: string | null;
  technicianId?: string | null;
  payloadJson?: any;
};

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getIntegrationPlatformService() {
    try {
      // Lazy lookup avoids a hard module cycle between events and integrations.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { IntegrationPlatformService } = require("../integrations/integration-platform.service");
      return this.moduleRef.get<any>(IntegrationPlatformService, { strict: false });
    } catch {
      return null;
    }
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private async ensureCustomerByName(companyId: string, name: string) {
    const clean = String(name || "").trim();
    if (!clean) return null;

    const existing = await this.prisma.customer.findFirst({
      where: {
        companyId,
        name: { equals: clean, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const base = this.slugify(clean) || "customer";
    let slug = base;
    for (let i = 0; i < 6; i += 1) {
      try {
        const created = await this.prisma.customer.create({
          data: {
            companyId,
            name: clean,
            slug,
          },
          select: { id: true },
        });
        return created.id;
      } catch {
        slug = `${base}-${Date.now().toString(36).slice(-4)}-${i + 1}`;
      }
    }
    return null;
  }

  async push(event: ActivityEventInput) {
    let tenantId = event.tenantId ?? null;
    let customerId = event.customerId ?? null;
    let customerName = event.customerName ?? null;

    if (!customerId && event.payloadJson && typeof event.payloadJson === "object") {
      const fromPayload = (event.payloadJson as any)?.customerId;
      if (typeof fromPayload === "string" && fromPayload.trim()) {
        customerId = fromPayload.trim();
      }
    }

    if (!customerId && event.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: event.jobId },
        select: { customerId: true, companyId: true, customerName: true },
      });
      if (job?.customerId) {
        customerId = job.customerId;
        tenantId = tenantId || job.companyId;
        customerName = customerName || job.customerName || null;
      }
    }

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: tenantId ? { id: customerId, companyId: tenantId } : { id: customerId },
        select: { id: true, name: true, companyId: true },
      });
      if (customer) {
        customerId = customer.id;
        customerName = customerName || customer.name;
        tenantId = tenantId || customer.companyId;
      } else {
        customerId = null;
      }
    }

    if (!customerId && tenantId && customerName) {
      customerId = await this.ensureCustomerByName(tenantId, customerName);
    }

    const created = await this.prisma.activityEvent.create({
      data: {
        type: event.type,
        label: event.label,
        at: event.at ? new Date(event.at) : new Date(),
        tenantId,
        customerId,
        jobId: event.jobId ?? null,
        jobRef: event.jobRef ?? null,
        customerName,
        status: event.status ?? null,
        vehicleReg: event.vehicleReg ?? null,
        technicianId: event.technicianId ?? null,
        payloadJson: event.payloadJson ?? null,
      },
    });

    const platform = this.getIntegrationPlatformService();
    if (platform) {
      void platform.publishActivityEvent(created).catch((error: any) => {
        this.logger.warn(`integration_platform_publish_failed event=${created.id} error=${error instanceof Error ? error.message : String(error)}`);
      });
    }

    return created;
  }

  private isValidationFixtureEvent(row: any) {
    const payload = row?.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : {};
    if (payload?.fixture === true || payload?.e2e === true || payload?.validation === true) return true;
    if (payload?.source === "e2e" || payload?.source === "playwright" || payload?.environment === "validation") return true;
    const legacyNeedle = `${row?.jobRef || ""} ${row?.label || ""} ${row?.customerName || ""}`;
    return /\b(E2E|Playwright|fixture|seeded)\b/i.test(legacyNeedle);
  }

  async list(limit = 20, tenantId?: string | null, filters?: { jobId?: string | null; customerId?: string | null; customerName?: string | null; includeValidation?: boolean }) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (filters?.jobId) where.jobId = filters.jobId;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.customerName) where.customerName = { equals: filters.customerName, mode: "insensitive" };
    const take = Math.max(1, Math.min(limit, 50));
    const rows = await this.prisma.activityEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: filters?.includeValidation ? take : Math.min(take * 3, 150),
    });
    return (filters?.includeValidation ? rows : rows.filter((row) => !this.isValidationFixtureEvent(row))).slice(0, take);
  }
}
