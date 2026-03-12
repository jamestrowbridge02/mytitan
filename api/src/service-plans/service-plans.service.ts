import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingsService } from "../bookings/bookings.service";
import { ActivityService } from "../events/activity.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListServicePlanChangeRequestsDto,
  PatchServicePlanDto,
  RequestServicePlanRenewalDto,
  UpsertServicePlanDto,
} from "./dto";

type ServicePlanStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
type ServicePlanCadenceUnit = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
type ServicePlanRenewalStatus = "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED" | "COMPLETED";
type ServicePlanChangeRequestKind =
  | "PAUSE_REQUEST"
  | "RESUME_REQUEST"
  | "CANCEL_REQUEST"
  | "CADENCE_CHANGE_REQUEST"
  | "SCOPE_CHANGE_REQUEST";

@Injectable()
export class ServicePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly jobs: JobsService,
    private readonly activity: ActivityService,
  ) {}

  private normalizeDate(value?: string | Date | null) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid service plan date");
    }
    return parsed;
  }

  private normalizeResponseNote(note?: string | null) {
    const normalized = String(note || "").trim();
    return normalized ? normalized.slice(0, 500) : null;
  }

  private addCadence(base: Date, unit: ServicePlanCadenceUnit, interval: number) {
    const next = new Date(base);
    if (unit === "WEEK") {
      next.setUTCDate(next.getUTCDate() + interval * 7);
      return next;
    }
    if (unit === "MONTH") {
      next.setUTCMonth(next.getUTCMonth() + interval);
      return next;
    }
    if (unit === "QUARTER") {
      next.setUTCMonth(next.getUTCMonth() + interval * 3);
      return next;
    }
    next.setUTCFullYear(next.getUTCFullYear() + interval);
    return next;
  }

  private validateCreateMode(autoCreateBooking: boolean, autoCreateJob: boolean) {
    if (autoCreateBooking === autoCreateJob) {
      throw new BadRequestException("Choose exactly one recurring creation mode: booking or job");
    }
  }

  private validateChangeRequestKind(plan: { status: ServicePlanStatus }, kind: ServicePlanChangeRequestKind) {
    if (kind === "PAUSE_REQUEST" && plan.status !== "ACTIVE") {
      throw new BadRequestException("Only active plans can be paused");
    }
    if (kind === "RESUME_REQUEST" && plan.status !== "PAUSED") {
      throw new BadRequestException("Only paused plans can be resumed");
    }
    if (kind === "CANCEL_REQUEST" && plan.status === "CANCELLED") {
      throw new BadRequestException("Cancelled plans cannot be cancelled again");
    }
  }

  private normalizeChangeRequestPayload(kind: ServicePlanChangeRequestKind, payloadJson?: Record<string, any> | null, note?: string | null) {
    const payload = payloadJson && typeof payloadJson === "object" ? { ...payloadJson } : {};
    const trimmedNote = this.normalizeResponseNote(note);
    if (trimmedNote) {
      payload.note = trimmedNote;
    }
    if (kind === "CADENCE_CHANGE_REQUEST") {
      const cadenceUnit = String(payload.cadenceUnit || "").toUpperCase();
      const cadenceInterval = Number(payload.cadenceInterval || 0);
      if (!["WEEK", "MONTH", "QUARTER", "YEAR"].includes(cadenceUnit) || !Number.isInteger(cadenceInterval) || cadenceInterval < 1) {
        throw new BadRequestException("Cadence change requests require cadenceUnit and cadenceInterval");
      }
      payload.cadenceUnit = cadenceUnit;
      payload.cadenceInterval = cadenceInterval;
      if (payload.nextRunAt) {
        payload.nextRunAt = this.normalizeDate(String(payload.nextRunAt))?.toISOString();
      }
    }
    return payload;
  }

  private ensureRenewalWindow(start: Date | null, end: Date | null) {
    if (!start || !end) {
      throw new BadRequestException("Renewal window start and end are required");
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException("Renewal window end must be after the start");
    }
  }

  private async resolveCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { companyId: tenantId, id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        slug: true,
      },
    });
    if (!customer) {
      throw new BadRequestException("Customer not found for this tenant");
    }
    return customer;
  }

  private async resolveDefaultLocationId(tenantId: string) {
    const settings = await this.prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { defaultLocationId: true },
    });
    return settings?.defaultLocationId || undefined;
  }

  private async expireRenewals(tenantId: string, customerId?: string) {
    await this.prisma.servicePlanRenewal.updateMany({
      where: {
        tenantId,
        status: "PENDING",
        renewalWindowEndAt: { lt: new Date() },
        ...(customerId ? { customerId } : {}),
      },
      data: {
        status: "EXPIRED",
        respondedAt: new Date(),
      },
    });
  }

  private async resolvePlan(tenantId: string, id: string) {
    await this.expireRenewals(tenantId);
    const plan = await this.prisma.servicePlan.findFirst({
      where: { id, tenantId },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true, slug: true },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        renewals: {
          orderBy: [{ createdAt: "desc" }],
          take: 5,
        },
        changeRequests: {
          orderBy: [{ requestedAt: "desc" }],
          take: 8,
        },
      },
    });
    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }
    return plan;
  }

  private async resolveCustomerPortalPlan(tenantId: string, customerId: string, id: string) {
    await this.expireRenewals(tenantId, customerId);
    const plan = await this.prisma.servicePlan.findFirst({
      where: {
        id,
        tenantId,
        customerId,
        portalVisible: true,
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true, slug: true },
        },
        tasks: { orderBy: { sortOrder: "asc" } },
        runs: { orderBy: { createdAt: "desc" }, take: 5 },
        renewals: { orderBy: [{ createdAt: "desc" }], take: 8 },
        changeRequests: { orderBy: [{ requestedAt: "desc" }], take: 12 },
      },
    });
    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }
    return plan;
  }

  private async resolveRenewal(tenantId: string, id: string) {
    await this.expireRenewals(tenantId);
    const renewal = await this.prisma.servicePlanRenewal.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true, status: true, nextRunAt: true } },
      },
    });
    if (!renewal) {
      throw new NotFoundException("Renewal not found");
    }
    return renewal;
  }

  private async resolveChangeRequest(tenantId: string, id: string) {
    const request = await this.prisma.servicePlanChangeRequest.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            cadenceUnit: true,
            cadenceInterval: true,
            nextRunAt: true,
            notesJson: true,
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException("Change request not found");
    }
    return request;
  }

  private async syncTasks(planId: string, tasks: Array<{ title: string; description?: string; sortOrder?: number; metadataJson?: any }> = []) {
    await this.prisma.servicePlanTask.deleteMany({ where: { planId } });
    if (!tasks.length) return;
    await this.prisma.servicePlanTask.createMany({
      data: tasks.map((task, index) => ({
        planId,
        title: String(task.title || "").trim(),
        description: task.description ? String(task.description) : null,
        sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : index,
        metadataJson: task.metadataJson ?? null,
      })),
    });
  }

  private async pushPlanActivity(params: {
    tenantId: string;
    customerId: string;
    customerName: string;
    planId: string;
    label: string;
    type: string;
    payloadJson?: any;
  }) {
    await this.activity.push({
      type: params.type,
      label: params.label,
      tenantId: params.tenantId,
      customerId: params.customerId,
      customerName: params.customerName,
      payloadJson: {
        planId: params.planId,
        ...(params.payloadJson || {}),
      },
    });
  }

  private serializeRenewal(row: any) {
    return {
      id: row.id,
      planId: row.planId,
      planName: row.plan?.name || null,
      customerId: row.customerId,
      customerName: row.customer?.name || null,
      customerSlug: row.customer?.slug || null,
      status: row.status,
      renewalWindowStartAt: row.renewalWindowStartAt,
      renewalWindowEndAt: row.renewalWindowEndAt,
      requestedAt: row.requestedAt,
      respondedAt: row.respondedAt,
      completedAt: row.completedAt,
      notesJson: row.notesJson || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeChangeRequest(row: any) {
    return {
      id: row.id,
      planId: row.planId,
      planName: row.plan?.name || null,
      customerId: row.customerId,
      customerName: row.customer?.name || null,
      customerSlug: row.customer?.slug || null,
      status: row.status,
      kind: row.kind,
      requestedBy: row.requestedBy,
      requestedAt: row.requestedAt,
      respondedAt: row.respondedAt,
      responseNote: row.responseNote || null,
      payloadJson: row.payloadJson || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializePlan(plan: any) {
    const currentRenewal = (plan.renewals || []).find((row: any) => row.status === "PENDING" || row.status === "APPROVED") || null;
    return {
      id: plan.id,
      tenantId: plan.tenantId,
      customerId: plan.customerId,
      customerName: plan.customer?.name || null,
      customerSlug: plan.customer?.slug || null,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      cadenceUnit: plan.cadenceUnit,
      cadenceInterval: plan.cadenceInterval,
      nextRunAt: plan.nextRunAt,
      lastRunAt: plan.lastRunAt,
      autoCreateBooking: Boolean(plan.autoCreateBooking),
      autoCreateJob: Boolean(plan.autoCreateJob),
      notesJson: plan.notesJson || null,
      portalVisible: Boolean(plan.portalVisible),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      tasks: (plan.tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        sortOrder: task.sortOrder,
        metadataJson: task.metadataJson || null,
      })),
      recentRuns: (plan.runs || []).map((run: any) => ({
        id: run.id,
        scheduledFor: run.scheduledFor,
        executedAt: run.executedAt,
        status: run.status,
        bookingId: run.bookingId,
        jobId: run.jobId,
        resultJson: run.resultJson || null,
      })),
      currentRenewal: currentRenewal ? this.serializeRenewal(currentRenewal) : null,
      recentRenewals: (plan.renewals || []).map((renewal: any) => this.serializeRenewal(renewal)),
      recentChangeRequests: (plan.changeRequests || []).map((request: any) => this.serializeChangeRequest(request)),
    };
  }

  private async applyChangeRequestCompletion(plan: any, request: any, responseNote?: string | null) {
    const note = this.normalizeResponseNote(responseNote);
    const payload = request.payloadJson && typeof request.payloadJson === "object" ? { ...request.payloadJson } : {};
    const now = new Date();

    if (request.kind === "PAUSE_REQUEST") {
      return this.prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          status: "PAUSED",
          notesJson: {
            ...(plan.notesJson && typeof plan.notesJson === "object" ? plan.notesJson : {}),
            lastChangeRequestAction: {
              kind: request.kind,
              completedAt: now.toISOString(),
              responseNote: note,
            },
          },
        },
      });
    }

    if (request.kind === "RESUME_REQUEST") {
      return this.prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          status: "ACTIVE",
          nextRunAt: !plan.nextRunAt || plan.nextRunAt.getTime() < now.getTime() ? now : plan.nextRunAt,
          notesJson: {
            ...(plan.notesJson && typeof plan.notesJson === "object" ? plan.notesJson : {}),
            lastChangeRequestAction: {
              kind: request.kind,
              completedAt: now.toISOString(),
              responseNote: note,
            },
          },
        },
      });
    }

    if (request.kind === "CANCEL_REQUEST") {
      return this.prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          status: "CANCELLED",
          notesJson: {
            ...(plan.notesJson && typeof plan.notesJson === "object" ? plan.notesJson : {}),
            lastChangeRequestAction: {
              kind: request.kind,
              completedAt: now.toISOString(),
              responseNote: note,
            },
          },
        },
      });
    }

    if (request.kind === "CADENCE_CHANGE_REQUEST") {
      return this.prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          cadenceUnit: payload.cadenceUnit,
          cadenceInterval: payload.cadenceInterval,
          nextRunAt: payload.nextRunAt ? new Date(payload.nextRunAt) : plan.nextRunAt,
          notesJson: {
            ...(plan.notesJson && typeof plan.notesJson === "object" ? plan.notesJson : {}),
            lastChangeRequestAction: {
              kind: request.kind,
              completedAt: now.toISOString(),
              responseNote: note,
              cadenceUnit: payload.cadenceUnit,
              cadenceInterval: payload.cadenceInterval,
            },
          },
        },
      });
    }

    return this.prisma.servicePlan.update({
      where: { id: plan.id },
      data: {
        notesJson: {
          ...(plan.notesJson && typeof plan.notesJson === "object" ? plan.notesJson : {}),
          lastScopeChangeRequest: {
            completedAt: now.toISOString(),
            responseNote: note,
            payloadJson: payload,
          },
        },
      },
    });
  }

  async list(tenantId: string, filters?: { customerId?: string }) {
    await this.expireRenewals(tenantId);
    const where: any = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;

    const plans = await this.prisma.servicePlan.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true, slug: true },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        renewals: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        changeRequests: {
          orderBy: { requestedAt: "desc" },
          take: 8,
        },
      },
      orderBy: [{ status: "asc" }, { nextRunAt: "asc" }, { createdAt: "desc" }],
    });

    return plans.map((plan) => this.serializePlan(plan));
  }

  async create(tenantId: string, userId: string, dto: UpsertServicePlanDto) {
    this.validateCreateMode(Boolean(dto.autoCreateBooking), Boolean(dto.autoCreateJob));
    const customer = await this.resolveCustomer(tenantId, dto.customerId);
    const nextRunAt = this.normalizeDate(dto.nextRunAt);

    const created = await this.prisma.servicePlan.create({
      data: {
        tenantId,
        customerId: customer.id,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: (dto.status || "ACTIVE") as ServicePlanStatus,
        cadenceUnit: dto.cadenceUnit as ServicePlanCadenceUnit,
        cadenceInterval: dto.cadenceInterval,
        nextRunAt,
        lastRunAt: null,
        autoCreateBooking: dto.autoCreateBooking,
        autoCreateJob: dto.autoCreateJob,
        notesJson: dto.notesJson ?? null,
        portalVisible: Boolean(dto.portalVisible),
        createdByUserId: userId,
      },
    });
    await this.syncTasks(created.id, dto.tasks || []);
    await this.pushPlanActivity({
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      planId: created.id,
      type: "service_plan.created",
      label: `Created recurring plan ${created.name}`,
      payloadJson: {
        status: created.status,
        cadenceUnit: created.cadenceUnit,
        cadenceInterval: created.cadenceInterval,
      },
    });
    return this.getById(tenantId, created.id);
  }

  async update(tenantId: string, _userId: string, id: string, dto: PatchServicePlanDto) {
    const existing = await this.resolvePlan(tenantId, id);
    const customer = dto.customerId ? await this.resolveCustomer(tenantId, dto.customerId) : existing.customer;
    const autoCreateBooking = dto.autoCreateBooking ?? existing.autoCreateBooking;
    const autoCreateJob = dto.autoCreateJob ?? existing.autoCreateJob;
    this.validateCreateMode(Boolean(autoCreateBooking), Boolean(autoCreateJob));

    const updated = await this.prisma.servicePlan.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        name: dto.name?.trim() || existing.name,
        description: dto.description !== undefined ? dto.description?.trim() || null : existing.description,
        status: (dto.status || existing.status) as ServicePlanStatus,
        cadenceUnit: (dto.cadenceUnit || existing.cadenceUnit) as ServicePlanCadenceUnit,
        cadenceInterval: dto.cadenceInterval ?? existing.cadenceInterval,
        nextRunAt: dto.nextRunAt !== undefined ? this.normalizeDate(dto.nextRunAt) : existing.nextRunAt,
        autoCreateBooking,
        autoCreateJob,
        notesJson: dto.notesJson !== undefined ? dto.notesJson ?? null : existing.notesJson,
        portalVisible: dto.portalVisible ?? existing.portalVisible,
      },
    });
    if (dto.tasks) {
      await this.syncTasks(existing.id, dto.tasks);
    }
    await this.pushPlanActivity({
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      planId: existing.id,
      type: "service_plan.updated",
      label: `Updated recurring plan ${updated.name}`,
      payloadJson: {
        status: updated.status,
      },
    });
    return this.getById(tenantId, existing.id);
  }

  async delete(tenantId: string, _userId: string, id: string) {
    const existing = await this.resolvePlan(tenantId, id);
    const runCount = await this.prisma.servicePlanRun.count({ where: { planId: existing.id } });
    if (runCount > 0) {
      throw new ConflictException("Service plans with run history cannot be deleted. Cancel the plan instead.");
    }
    await this.prisma.servicePlan.delete({ where: { id: existing.id } });
    await this.pushPlanActivity({
      tenantId,
      customerId: existing.customer.id,
      customerName: existing.customer.name,
      planId: existing.id,
      type: "service_plan.deleted",
      label: `Deleted recurring plan ${existing.name}`,
    });
    return { ok: true };
  }

  async getById(tenantId: string, id: string) {
    const plan = await this.resolvePlan(tenantId, id);
    return this.serializePlan(plan);
  }

  async getRuns(tenantId: string, id: string) {
    await this.resolvePlan(tenantId, id);
    const runs = await this.prisma.servicePlanRun.findMany({
      where: { tenantId, planId: id },
      orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    return runs.map((run) => ({
      id: run.id,
      scheduledFor: run.scheduledFor,
      executedAt: run.executedAt,
      status: run.status,
      bookingId: run.bookingId,
      jobId: run.jobId,
      resultJson: run.resultJson || null,
      createdAt: run.createdAt,
    }));
  }

  private async executePlanInternal(tenantId: string, actorUserId: string, planId: string, scheduledFor: Date, trigger: "due" | "manual") {
    const plan = await this.resolvePlan(tenantId, planId);
    if (plan.status !== "ACTIVE") {
      throw new BadRequestException("Only active service plans can be executed");
    }

    const existingRun = await this.prisma.servicePlanRun.findUnique({
      where: {
        planId_scheduledFor: {
          planId: plan.id,
          scheduledFor,
        },
      },
    });
    if (existingRun) {
      return existingRun;
    }

    const pendingRun = await this.prisma.servicePlanRun.create({
      data: {
        tenantId,
        planId: plan.id,
        scheduledFor,
        status: "PENDING",
        resultJson: {
          trigger,
        },
      },
    });

    try {
      const locationId = await this.resolveDefaultLocationId(tenantId);
      let bookingId: string | null = null;
      let jobId: string | null = null;
      const taskSummary = plan.tasks.map((task: any) => task.title);
      const notesJson = {
        servicePlanId: plan.id,
        servicePlanName: plan.name,
        recurring: true,
        trigger,
        taskTitles: taskSummary,
      };

      if (plan.autoCreateBooking) {
        const booking = await this.bookings.create(tenantId, actorUserId, {
          locationId,
          customerName: plan.customer.name,
          customerEmail: plan.customer.email || undefined,
          customerPhone: plan.customer.phone || undefined,
          startsAt: scheduledFor.toISOString(),
          endsAt: new Date(scheduledFor.getTime() + 60 * 60 * 1000).toISOString(),
          status: "PLANNED",
        } as any);
        bookingId = booking.id;
      } else if (plan.autoCreateJob) {
        const job = await this.jobs.create(tenantId, actorUserId, {
          locationId,
          customerName: plan.customer.name,
          customerEmail: plan.customer.email || undefined,
          customerPhone: plan.customer.phone || undefined,
          scheduledAt: scheduledFor.toISOString(),
          serviceName: plan.name,
          formData: notesJson,
        } as any);
        jobId = job.id;
      }

      const nextRunAt =
        plan.status === "ACTIVE" && (!plan.nextRunAt || plan.nextRunAt.getTime() <= scheduledFor.getTime())
          ? this.addCadence(scheduledFor, plan.cadenceUnit as ServicePlanCadenceUnit, plan.cadenceInterval)
          : plan.nextRunAt;

      const updatedRun = await this.prisma.servicePlanRun.update({
        where: { id: pendingRun.id },
        data: {
          executedAt: new Date(),
          status: "EXECUTED",
          bookingId,
          jobId,
          resultJson: {
            trigger,
            bookingId,
            jobId,
            taskTitles: taskSummary,
          },
        },
      });

      await this.prisma.servicePlan.update({
        where: { id: plan.id },
        data: {
          lastRunAt: scheduledFor,
          nextRunAt,
        },
      });

      await this.pushPlanActivity({
        tenantId,
        customerId: plan.customer.id,
        customerName: plan.customer.name,
        planId: plan.id,
        type: "service_plan.executed",
        label: `Executed recurring plan ${plan.name}`,
        payloadJson: {
          trigger,
          scheduledFor: scheduledFor.toISOString(),
          bookingId,
          jobId,
        },
      });

      return updatedRun;
    } catch (error: any) {
      await this.prisma.servicePlanRun.update({
        where: { id: pendingRun.id },
        data: {
          executedAt: new Date(),
          status: "FAILED",
          resultJson: {
            trigger,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
      await this.pushPlanActivity({
        tenantId,
        customerId: plan.customer.id,
        customerName: plan.customer.name,
        planId: plan.id,
        type: "service_plan.failed",
        label: `Recurring plan ${plan.name} failed`,
        payloadJson: {
          trigger,
          scheduledFor: scheduledFor.toISOString(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async runNow(tenantId: string, userId: string, id: string) {
    const run = await this.executePlanInternal(tenantId, userId, id, new Date(), "manual");
    return {
      ok: true,
      runId: run.id,
      status: run.status,
      bookingId: run.bookingId,
      jobId: run.jobId,
    };
  }

  async evaluateDuePlans(tenantId: string, userId: string, asOf = new Date()) {
    const duePlans = await this.prisma.servicePlan.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        nextRunAt: { lte: asOf },
      },
      orderBy: { nextRunAt: "asc" },
      select: { id: true, nextRunAt: true },
    });

    const results = [];
    for (const plan of duePlans) {
      if (!plan.nextRunAt) continue;
      try {
        const run = await this.executePlanInternal(tenantId, userId, plan.id, plan.nextRunAt, "due");
        results.push({ planId: plan.id, runId: run.id, status: run.status });
      } catch (error: any) {
        results.push({ planId: plan.id, status: "FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return {
      evaluated: duePlans.length,
      results,
    };
  }

  async pause(tenantId: string, _userId: string, id: string) {
    const plan = await this.resolvePlan(tenantId, id);
    const updated = await this.prisma.servicePlan.update({
      where: { id: plan.id },
      data: { status: "PAUSED" },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.paused",
      label: `Paused recurring plan ${plan.name}`,
    });
    return this.getById(tenantId, updated.id);
  }

  async resume(tenantId: string, _userId: string, id: string) {
    const plan = await this.resolvePlan(tenantId, id);
    const now = new Date();
    const updated = await this.prisma.servicePlan.update({
      where: { id: plan.id },
      data: {
        status: "ACTIVE",
        nextRunAt: !plan.nextRunAt || plan.nextRunAt.getTime() < now.getTime() ? now : plan.nextRunAt,
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.resumed",
      label: `Resumed recurring plan ${plan.name}`,
    });
    return this.getById(tenantId, updated.id);
  }

  async requestRenewal(tenantId: string, userId: string, planId: string, dto: RequestServicePlanRenewalDto) {
    const plan = await this.resolvePlan(tenantId, planId);
    if (plan.status === "CANCELLED") {
      throw new BadRequestException("Cancelled plans cannot receive renewal requests");
    }
    const renewalWindowStartAt = this.normalizeDate(dto.renewalWindowStartAt);
    const renewalWindowEndAt = this.normalizeDate(dto.renewalWindowEndAt);
    this.ensureRenewalWindow(renewalWindowStartAt, renewalWindowEndAt);

    const existing = await this.prisma.servicePlanRenewal.findFirst({
      where: {
        tenantId,
        planId: plan.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("An open renewal already exists for this plan");
    }

    const renewal = await this.prisma.servicePlanRenewal.create({
      data: {
        tenantId,
        planId: plan.id,
        customerId: plan.customerId,
        status: "PENDING",
        renewalWindowStartAt: renewalWindowStartAt!,
        renewalWindowEndAt: renewalWindowEndAt!,
        requestedAt: new Date(),
        notesJson: {
          ...(dto.notesJson || {}),
          requestedByUserId: userId,
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });

    await this.pushPlanActivity({
      tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.renewal.requested",
      label: `Requested renewal for ${plan.name}`,
      payloadJson: {
        renewalId: renewal.id,
        renewalWindowStartAt: renewal.renewalWindowStartAt,
        renewalWindowEndAt: renewal.renewalWindowEndAt,
        requestedByUserId: userId,
      },
    });
    return this.serializeRenewal(renewal);
  }

  async listRenewals(tenantId: string) {
    await this.expireRenewals(tenantId);
    const rows = await this.prisma.servicePlanRenewal.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { renewalWindowEndAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return rows.map((row) => this.serializeRenewal(row));
  }

  async completeRenewal(tenantId: string, userId: string, renewalId: string, responseNote?: string | null) {
    const renewal = await this.resolveRenewal(tenantId, renewalId);
    if (!["APPROVED", "PENDING"].includes(renewal.status)) {
      throw new BadRequestException("Only pending or approved renewals can be completed");
    }
    const nextStatus: ServicePlanRenewalStatus = renewal.status === "PENDING" ? "COMPLETED" : "COMPLETED";
    const note = this.normalizeResponseNote(responseNote);
    const updated = await this.prisma.servicePlanRenewal.update({
      where: { id: renewal.id },
      data: {
        status: nextStatus,
        completedAt: new Date(),
        respondedAt: renewal.respondedAt || new Date(),
        notesJson: {
          ...(renewal.notesJson && typeof renewal.notesJson === "object" ? renewal.notesJson : {}),
          completedByUserId: userId,
          completionNote: note,
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: renewal.customer.id,
      customerName: renewal.customer.name,
      planId: renewal.plan.id,
      type: "service_plan.renewal.completed",
      label: `Completed renewal handling for ${renewal.plan.name}`,
      payloadJson: {
        renewalId: renewal.id,
        completedByUserId: userId,
        responseNote: note,
      },
    });
    return this.serializeRenewal(updated);
  }

  async customerApproveRenewal(tenantId: string, customerId: string, planId: string, note?: string) {
    const plan = await this.resolveCustomerPortalPlan(tenantId, customerId, planId);
    const renewal = (plan.renewals || []).find((row: any) => row.status === "PENDING");
    if (!renewal) {
      throw new BadRequestException("No pending renewal is available for this plan");
    }
    const updated = await this.prisma.servicePlanRenewal.update({
      where: { id: renewal.id },
      data: {
        status: "APPROVED",
        respondedAt: new Date(),
        notesJson: {
          ...(renewal.notesJson && typeof renewal.notesJson === "object" ? renewal.notesJson : {}),
          customerNote: this.normalizeResponseNote(note),
          respondedBy: "CUSTOMER",
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.renewal.approved",
      label: `Customer approved renewal for ${plan.name}`,
      payloadJson: {
        renewalId: renewal.id,
        note: this.normalizeResponseNote(note),
      },
    });
    return this.serializeRenewal(updated);
  }

  async customerDeclineRenewal(tenantId: string, customerId: string, planId: string, note?: string) {
    const plan = await this.resolveCustomerPortalPlan(tenantId, customerId, planId);
    const renewal = (plan.renewals || []).find((row: any) => row.status === "PENDING");
    if (!renewal) {
      throw new BadRequestException("No pending renewal is available for this plan");
    }
    const updated = await this.prisma.servicePlanRenewal.update({
      where: { id: renewal.id },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
        notesJson: {
          ...(renewal.notesJson && typeof renewal.notesJson === "object" ? renewal.notesJson : {}),
          customerNote: this.normalizeResponseNote(note),
          respondedBy: "CUSTOMER",
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.renewal.declined",
      label: `Customer declined renewal for ${plan.name}`,
      payloadJson: {
        renewalId: renewal.id,
        note: this.normalizeResponseNote(note),
      },
    });
    return this.serializeRenewal(updated);
  }

  async listChangeRequests(tenantId: string, filters?: ListServicePlanChangeRequestsDto) {
    const rows = await this.prisma.servicePlanChangeRequest.findMany({
      where: {
        tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
      take: 100,
    });
    return rows.map((row) => this.serializeChangeRequest(row));
  }

  async createChangeRequest(params: {
    tenantId: string;
    customerId: string;
    planId: string;
    requestedBy: "CUSTOMER" | "OPERATOR";
    kind: ServicePlanChangeRequestKind;
    payloadJson?: Record<string, any> | null;
    note?: string | null;
  }) {
    const plan =
      params.requestedBy === "CUSTOMER"
        ? await this.resolveCustomerPortalPlan(params.tenantId, params.customerId, params.planId)
        : await this.resolvePlan(params.tenantId, params.planId);
    if (plan.customerId !== params.customerId) {
      throw new BadRequestException("Service plan does not belong to this customer");
    }
    this.validateChangeRequestKind(plan, params.kind);

    const existing = await this.prisma.servicePlanChangeRequest.findFirst({
      where: {
        tenantId: params.tenantId,
        planId: plan.id,
        kind: params.kind,
        status: { in: ["OPEN", "APPROVED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("An open request already exists for this plan and request type");
    }

    const payloadJson = this.normalizeChangeRequestPayload(params.kind, params.payloadJson, params.note);
    const request = await this.prisma.servicePlanChangeRequest.create({
      data: {
        tenantId: params.tenantId,
        planId: plan.id,
        customerId: plan.customerId,
        status: "OPEN",
        kind: params.kind,
        requestedBy: params.requestedBy,
        payloadJson,
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId: params.tenantId,
      customerId: plan.customer.id,
      customerName: plan.customer.name,
      planId: plan.id,
      type: "service_plan.change_request.created",
      label: `${params.requestedBy === "CUSTOMER" ? "Customer" : "Operator"} requested ${params.kind.replaceAll("_", " ").toLowerCase()} for ${plan.name}`,
      payloadJson: {
        requestId: request.id,
        kind: params.kind,
        requestedBy: params.requestedBy,
        payloadJson,
      },
    });
    return this.serializeChangeRequest(request);
  }

  async approveChangeRequest(tenantId: string, userId: string, id: string, responseNote?: string | null) {
    const request = await this.resolveChangeRequest(tenantId, id);
    if (request.status !== "OPEN") {
      throw new BadRequestException("Only open requests can be approved");
    }
    const note = this.normalizeResponseNote(responseNote);
    const updated = await this.prisma.servicePlanChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        respondedAt: new Date(),
        responseNote: note,
        payloadJson: {
          ...(request.payloadJson && typeof request.payloadJson === "object" ? request.payloadJson : {}),
          respondedByUserId: userId,
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: request.customer.id,
      customerName: request.customer.name,
      planId: request.plan.id,
      type: "service_plan.change_request.approved",
      label: `Approved ${request.kind.replaceAll("_", " ").toLowerCase()} for ${request.plan.name}`,
      payloadJson: {
        requestId: request.id,
        responseNote: note,
        respondedByUserId: userId,
      },
    });
    return this.serializeChangeRequest(updated);
  }

  async declineChangeRequest(tenantId: string, userId: string, id: string, responseNote?: string | null) {
    const request = await this.resolveChangeRequest(tenantId, id);
    if (request.status !== "OPEN") {
      throw new BadRequestException("Only open requests can be declined");
    }
    const note = this.normalizeResponseNote(responseNote);
    const updated = await this.prisma.servicePlanChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
        responseNote: note,
        payloadJson: {
          ...(request.payloadJson && typeof request.payloadJson === "object" ? request.payloadJson : {}),
          respondedByUserId: userId,
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: request.customer.id,
      customerName: request.customer.name,
      planId: request.plan.id,
      type: "service_plan.change_request.declined",
      label: `Declined ${request.kind.replaceAll("_", " ").toLowerCase()} for ${request.plan.name}`,
      payloadJson: {
        requestId: request.id,
        responseNote: note,
        respondedByUserId: userId,
      },
    });
    return this.serializeChangeRequest(updated);
  }

  async completeChangeRequest(tenantId: string, userId: string, id: string, responseNote?: string | null) {
    const request = await this.resolveChangeRequest(tenantId, id);
    if (request.status !== "APPROVED") {
      throw new BadRequestException("Only approved requests can be completed");
    }
    await this.applyChangeRequestCompletion(request.plan, request, responseNote);
    const note = this.normalizeResponseNote(responseNote);
    const updated = await this.prisma.servicePlanChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        respondedAt: request.respondedAt || new Date(),
        responseNote: note || request.responseNote,
        payloadJson: {
          ...(request.payloadJson && typeof request.payloadJson === "object" ? request.payloadJson : {}),
          completedByUserId: userId,
          completedAt: new Date().toISOString(),
        },
      },
      include: {
        customer: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true } },
      },
    });
    await this.pushPlanActivity({
      tenantId,
      customerId: request.customer.id,
      customerName: request.customer.name,
      planId: request.plan.id,
      type: "service_plan.change_request.completed",
      label: `Completed ${request.kind.replaceAll("_", " ").toLowerCase()} for ${request.plan.name}`,
      payloadJson: {
        requestId: request.id,
        responseNote: note,
        completedByUserId: userId,
      },
    });
    return this.serializeChangeRequest(updated);
  }

  async listPortalVisibleForCustomer(tenantId: string, customerId: string) {
    await this.expireRenewals(tenantId, customerId);
    const plans = await this.prisma.servicePlan.findMany({
      where: {
        tenantId,
        customerId,
        portalVisible: true,
      },
      orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
      include: {
        tasks: { orderBy: { sortOrder: "asc" } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        renewals: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        changeRequests: {
          orderBy: { requestedAt: "desc" },
          take: 8,
        },
      },
    });
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description || null,
      status: plan.status,
      cadenceUnit: plan.cadenceUnit,
      cadenceInterval: plan.cadenceInterval,
      nextRunAt: plan.nextRunAt,
      lastRunAt: plan.lastRunAt,
      lastRunStatus: plan.runs[0]?.status || null,
      tasks: (plan.tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
      })),
      currentRenewal: (plan.renewals || []).find((row: any) => row.status === "PENDING" || row.status === "APPROVED")
        ? this.serializeRenewal((plan.renewals || []).find((row: any) => row.status === "PENDING" || row.status === "APPROVED"))
        : null,
      renewals: (plan.renewals || []).map((row: any) => this.serializeRenewal(row)),
      changeRequests: (plan.changeRequests || []).map((row: any) => this.serializeChangeRequest(row)),
    }));
  }

  async getPortalVisibleForCustomerById(tenantId: string, customerId: string, planId: string) {
    const plan = await this.resolveCustomerPortalPlan(tenantId, customerId, planId);
    return {
      ...this.serializePlan(plan),
      renewals: (plan.renewals || []).map((row: any) => this.serializeRenewal(row)),
      changeRequests: (plan.changeRequests || []).map((row: any) => this.serializeChangeRequest(row)),
    };
  }
}
