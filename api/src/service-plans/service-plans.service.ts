import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingsService } from "../bookings/bookings.service";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../events/activity.service";
import { PatchServicePlanDto, UpsertServicePlanDto } from "./dto";

type ServicePlanStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
type ServicePlanCadenceUnit = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

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

  private async resolveCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { companyId: tenantId, id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
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

  private async resolvePlan(tenantId: string, id: string) {
    const plan = await this.prisma.servicePlan.findFirst({
      where: { id, tenantId },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
    if (!plan) {
      throw new NotFoundException("Service plan not found");
    }
    return plan;
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

  private serializePlan(plan: any) {
    return {
      id: plan.id,
      tenantId: plan.tenantId,
      customerId: plan.customerId,
      customerName: plan.customer?.name || null,
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
    };
  }

  async list(tenantId: string, filters?: { customerId?: string }) {
    const where: any = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;

    const plans = await this.prisma.servicePlan.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        tasks: {
          orderBy: { sortOrder: "asc" },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
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

  async update(tenantId: string, userId: string, id: string, dto: PatchServicePlanDto) {
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

  async delete(tenantId: string, userId: string, id: string) {
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

  async listPortalVisibleForCustomer(tenantId: string, customerId: string) {
    const plans = await this.prisma.servicePlan.findMany({
      where: {
        tenantId,
        customerId,
        portalVisible: true,
      },
      orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      status: plan.status,
      nextRunAt: plan.nextRunAt,
      lastRunAt: plan.lastRunAt,
      lastRunStatus: plan.runs[0]?.status || null,
    }));
  }
}
