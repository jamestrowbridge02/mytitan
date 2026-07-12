import { BadRequestException, Injectable, Logger } from "@nestjs/common";
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
  actorUserId?: string | null;
  locationId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  supportSessionId?: string | null;
  tenantVisible?: boolean;
  payloadJson?: any;
};

type ActivityListFilters = {
  jobId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
};

type ActivityScope =
  | "TENANT_ACTIVITY"
  | "PLATFORM_ACTIVITY"
  | "SUPPORT_SESSION_ACTIVITY"
  | "SYSTEM_OPERATIONAL_ACTIVITY"
  | "VALIDATION_E2E_ACTIVITY";

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

  private runtimeEnvironment() {
    return String(process.env.MYTITAN_RUNTIME_ENV || process.env.MYTITAN_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  }

  private isProductionRuntime() {
    const environment = this.runtimeEnvironment();
    return environment === "production" || environment === "prod";
  }

  private normalizedPayload(value: any) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  private payloadScope(payload: any): ActivityScope | null {
    const scope = String(payload?.activityScope || payload?.scope || "").trim();
    if (
      scope === "TENANT_ACTIVITY" ||
      scope === "PLATFORM_ACTIVITY" ||
      scope === "SUPPORT_SESSION_ACTIVITY" ||
      scope === "SYSTEM_OPERATIONAL_ACTIVITY" ||
      scope === "VALIDATION_E2E_ACTIVITY"
    ) {
      return scope;
    }
    return null;
  }

  private hasStructuredValidationMarker(payload: any) {
    const environment = String(payload?.environment || "").trim().toLowerCase();
    const source = String(payload?.source || "").trim().toLowerCase();
    return (
      payload?.fixture === true ||
      payload?.e2e === true ||
      payload?.validation === true ||
      payload?.demo === true ||
      this.payloadScope(payload) === "VALIDATION_E2E_ACTIVITY" ||
      ["e2e", "playwright", "validation", "fixture", "demo"].includes(source) ||
      ["e2e", "test", "validation", "fixture", "demo"].includes(environment)
    );
  }

  private assertValidationCreationAllowed(payload: any) {
    if (this.isProductionRuntime() && this.hasStructuredValidationMarker(payload)) {
      throw new BadRequestException("Validation activity cannot be created in production");
    }
  }

  private isValidationFixtureTenant(tenantId?: string | null) {
    return Boolean(tenantId && tenantId === "e2e-company");
  }

  private resolveTenantActivityScope(tenantId: string, payload: Record<string, any>, tenantVisible?: boolean) {
    if (this.hasStructuredValidationMarker(payload)) return "VALIDATION_E2E_ACTIVITY";
    if (tenantVisible === true) return "TENANT_ACTIVITY";
    if (!this.isProductionRuntime() && this.isValidationFixtureTenant(tenantId)) return "VALIDATION_E2E_ACTIVITY";
    return "TENANT_ACTIVITY";
  }

  private buildStoredPayload(event: ActivityEventInput, scope: ActivityScope, payload: Record<string, any>) {
    return {
      ...payload,
      activityScope: scope,
      tenantVisible: event.tenantVisible ?? scope === "TENANT_ACTIVITY",
      actorUserId: event.actorUserId ?? payload.actorUserId ?? null,
      locationId: event.locationId ?? payload.locationId ?? null,
      subjectType: event.subjectType ?? payload.subjectType ?? null,
      subjectId: event.subjectId ?? payload.subjectId ?? event.jobId ?? event.customerId ?? null,
      supportSessionId: event.supportSessionId ?? payload.supportSessionId ?? null,
      runtimeEnvironment: payload.runtimeEnvironment ?? this.runtimeEnvironment() ?? null,
    };
  }

  async push(event: ActivityEventInput) {
    const payload = this.normalizedPayload(event.payloadJson);
    this.assertValidationCreationAllowed(payload);

    let tenantId = event.tenantId ?? null;
    let customerId = event.customerId ?? null;
    let customerName = event.customerName ?? null;
    let jobRef = event.jobRef ?? null;
    let status = event.status ?? null;

    if (!customerId) {
      const fromPayload = payload.customerId;
      if (typeof fromPayload === "string" && fromPayload.trim()) {
        customerId = fromPayload.trim();
      }
    }

    if (event.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: event.jobId },
        select: { customerId: true, companyId: true, customerName: true, jobRef: true, status: true },
      });
      if (!job) {
        throw new BadRequestException("Activity job subject not found");
      }
      if (tenantId && job.companyId !== tenantId) {
        throw new BadRequestException("Activity job subject does not belong to tenant");
      }
      customerId = customerId || job.customerId || null;
      tenantId = tenantId || job.companyId;
      customerName = customerName || job.customerName || null;
      jobRef = jobRef || job.jobRef || null;
      status = status || job.status || null;
    }

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: tenantId ? { id: customerId, companyId: tenantId } : { id: customerId },
        select: { id: true, name: true, companyId: true },
      });
      if (!customer) {
        throw new BadRequestException("Activity customer subject does not belong to tenant");
      }
      customerId = customer.id;
      customerName = customerName || customer.name;
      tenantId = tenantId || customer.companyId;
    }

    if (!customerId && tenantId && customerName) {
      customerId = await this.ensureCustomerByName(tenantId, customerName);
    }

    if (!tenantId) {
      throw new BadRequestException("Tenant activity requires company ownership");
    }

    const storedPayload = this.buildStoredPayload(event, this.resolveTenantActivityScope(tenantId, payload, event.tenantVisible), payload);

    const created = await this.prisma.activityEvent.create({
      data: {
        type: event.type,
        label: event.label,
        at: event.at ? new Date(event.at) : new Date(),
        tenantId,
        customerId,
        jobId: event.jobId ?? null,
        jobRef,
        customerName,
        status,
        vehicleReg: event.vehicleReg ?? null,
        technicianId: event.technicianId ?? null,
        payloadJson: storedPayload,
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

  async pushPlatformActivity(event: Omit<ActivityEventInput, "tenantId" | "tenantVisible">) {
    const payload = this.normalizedPayload(event.payloadJson);
    this.assertValidationCreationAllowed(payload);

    return this.prisma.activityEvent.create({
      data: {
        type: event.type,
        label: event.label,
        at: event.at ? new Date(event.at) : new Date(),
        tenantId: null,
        customerId: null,
        jobId: null,
        jobRef: event.jobRef ?? null,
        customerName: event.customerName ?? null,
        status: event.status ?? null,
        vehicleReg: event.vehicleReg ?? null,
        technicianId: event.technicianId ?? null,
        payloadJson: this.buildStoredPayload({ ...event, tenantVisible: false }, "PLATFORM_ACTIVITY", payload),
      },
    });
  }

  private isValidationFixtureEvent(row: any) {
    const payload = row?.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : {};
    return this.hasStructuredValidationMarker(payload);
  }

  private isTenantVisible(row: any) {
    const payload = this.normalizedPayload(row?.payloadJson);
    const scope = this.payloadScope(payload) || "TENANT_ACTIVITY";
    if (scope === "PLATFORM_ACTIVITY" || scope === "SYSTEM_OPERATIONAL_ACTIVITY" || scope === "VALIDATION_E2E_ACTIVITY") return false;
    if (scope === "SUPPORT_SESSION_ACTIVITY" && payload.tenantVisible !== true) return false;
    if (payload.tenantVisible === false) return false;
    return !this.isValidationFixtureEvent(row);
  }

  private async filterTenantSubjectOwnership(companyId: string, rows: any[]) {
    const jobIds = [...new Set(rows.map((row) => row.jobId).filter(Boolean))] as string[];
    const customerIds = [...new Set(rows.map((row) => row.customerId).filter(Boolean))] as string[];

    const [jobs, customers] = await Promise.all([
      jobIds.length
        ? this.prisma.job.findMany({ where: { id: { in: jobIds }, companyId }, select: { id: true } })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customer.findMany({ where: { id: { in: customerIds }, companyId }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    const ownedJobIds = new Set(jobs.map((job) => job.id));
    const ownedCustomerIds = new Set(customers.map((customer) => customer.id));

    return rows.filter((row) => (!row.jobId || ownedJobIds.has(row.jobId)) && (!row.customerId || ownedCustomerIds.has(row.customerId)));
  }

  async getTenantActivity(companyId: string, limit = 20, filters?: ActivityListFilters) {
    if (!companyId) {
      throw new BadRequestException("Tenant activity requires company ownership");
    }
    const where: any = { tenantId: companyId };
    if (filters?.jobId) where.jobId = filters.jobId;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.customerName) where.customerName = { equals: filters.customerName, mode: "insensitive" };
    const take = Math.max(1, Math.min(limit, 50));
    const rows = await this.prisma.activityEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: Math.min(take * 4, 200),
    });
    const tenantVisibleRows = rows.filter((row) => this.isTenantVisible(row));
    const ownedRows = await this.filterTenantSubjectOwnership(companyId, tenantVisibleRows);
    return ownedRows.slice(0, take);
  }

  async getPlatformActivity(limit = 20) {
    const take = Math.max(1, Math.min(limit, 50));
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        tenantId: null,
      },
      orderBy: { at: "desc" },
      take,
    });
    return rows.filter((row) => this.payloadScope(this.normalizedPayload(row.payloadJson)) === "PLATFORM_ACTIVITY");
  }

  async list(limit = 20, tenantId?: string | null, filters?: ActivityListFilters) {
    if (!tenantId) {
      throw new BadRequestException("Tenant activity requires company ownership");
    }
    return this.getTenantActivity(tenantId, limit, filters);
  }
}
