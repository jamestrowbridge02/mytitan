import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { resolveWorkflowStageReadiness } from "../config/workflow-stage-readiness";
import { ActivityService } from "../events/activity.service";
import { AutomationsService } from "../automations/automations.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListComplianceExceptionsDto, ListWorkflowSlaEventsDto, UpsertWorkflowSlaPolicyDto } from "./dto";

type EntitySnapshot = {
  entityType: "JOB" | "BOOKING" | "QUOTE" | "APPROVAL" | "SERVICE_PLAN";
  entityId: string;
  status: string;
  locationId?: string | null;
  assignedUserId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  label?: string | null;
  payloadJson?: Record<string, any> | null;
};

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly automations: AutomationsService,
  ) {}

  private get db() {
    return this.prisma as any;
  }

  private now() {
    return new Date();
  }

  private normalizeStatus(value: string | null | undefined) {
    return String(value || "").trim().toUpperCase();
  }

  private normalizeEntityType(value: string) {
    return this.normalizeStatus(value) as EntitySnapshot["entityType"];
  }

  private toExceptionSeverity(value: string | null | undefined) {
    return value === "CRITICAL" ? "CRITICAL" : "WARNING";
  }

  private toHref(entityType: string, entityId: string) {
    if (entityType === "JOB") return `/dashboard/jobs/${entityId}`;
    if (entityType === "BOOKING") return `/dashboard/bookings/${entityId}`;
    if (entityType === "QUOTE") return `/dashboard/quotes`;
    if (entityType === "SERVICE_PLAN") return `/dashboard/service-plans`;
    if (entityType === "APPROVAL") return `/dashboard/customers`;
    return "/dashboard/compliance";
  }

  private async buildEntitySnapshot(tenantId: string, entityType: EntitySnapshot["entityType"], entityId: string): Promise<EntitySnapshot | null> {
    if (entityType === "JOB") {
      const job = await this.db.job.findFirst({
        where: { id: entityId, companyId: tenantId },
        select: {
          id: true,
          status: true,
          locationId: true,
          assignedUserId: true,
          customerId: true,
          customerName: true,
          jobRef: true,
        },
      });
      if (!job) return null;
      return {
        entityType,
        entityId: job.id,
        status: job.status,
        locationId: job.locationId || null,
        assignedUserId: job.assignedUserId || null,
        customerId: job.customerId || null,
        customerName: job.customerName || null,
        jobId: job.id,
        jobRef: job.jobRef || null,
        label: job.jobRef || job.id,
      };
    }
    if (entityType === "BOOKING") {
      const booking = await this.db.booking.findFirst({
        where: { id: entityId, companyId: tenantId },
        select: {
          id: true,
          status: true,
          locationId: true,
          assignedUserId: true,
          customerName: true,
          jobId: true,
          job: { select: { jobRef: true, customerId: true } },
        },
      });
      if (!booking) return null;
      return {
        entityType,
        entityId: booking.id,
        status: booking.status,
        locationId: booking.locationId || null,
        assignedUserId: booking.assignedUserId || null,
        customerId: booking.job?.customerId || null,
        customerName: booking.customerName || null,
        jobId: booking.jobId || null,
        jobRef: booking.job?.jobRef || null,
        label: booking.customerName || booking.id,
      };
    }
    if (entityType === "QUOTE") {
      const quote = await this.db.quote.findFirst({
        where: { id: entityId, tenantId },
        select: {
          id: true,
          status: true,
          customerId: true,
          customer: { select: { name: true } },
          quoteNumber: true,
          jobId: true,
          job: { select: { jobRef: true, locationId: true, assignedUserId: true } },
          booking: { select: { locationId: true, assignedUserId: true } },
        },
      });
      if (!quote) return null;
      return {
        entityType,
        entityId: quote.id,
        status: quote.status,
        locationId: quote.job?.locationId || quote.booking?.locationId || null,
        assignedUserId: quote.job?.assignedUserId || quote.booking?.assignedUserId || null,
        customerId: quote.customerId,
        customerName: quote.customer?.name || null,
        jobId: quote.jobId || null,
        jobRef: quote.job?.jobRef || null,
        label: quote.quoteNumber,
      };
    }
    if (entityType === "SERVICE_PLAN") {
      const plan = await this.db.servicePlan.findFirst({
        where: { id: entityId, tenantId },
        select: {
          id: true,
          status: true,
          locationId: true,
          customerId: true,
          customer: { select: { name: true } },
          name: true,
        },
      });
      if (!plan) return null;
      return {
        entityType,
        entityId: plan.id,
        status: plan.status,
        locationId: plan.locationId || null,
        assignedUserId: null,
        customerId: plan.customerId,
        customerName: plan.customer?.name || null,
        label: plan.name,
      };
    }
    const approval = await this.db.customerApproval.findFirst({
      where: { id: entityId, tenantId },
      select: {
        id: true,
        status: true,
        customerId: true,
        customer: { select: { name: true } },
        entityType: true,
        entityId: true,
      },
    });
    if (!approval) return null;
    let locationId: string | null = null;
    let assignedUserId: string | null = null;
    let jobId: string | null = null;
    let jobRef: string | null = null;
    if (approval.entityType === "JOB") {
      const job = await this.db.job.findFirst({
        where: { id: approval.entityId, companyId: tenantId },
        select: { id: true, locationId: true, assignedUserId: true, jobRef: true },
      });
      locationId = job?.locationId || null;
      assignedUserId = job?.assignedUserId || null;
      jobId = job?.id || null;
      jobRef = job?.jobRef || null;
    }
    return {
      entityType,
      entityId: approval.id,
      status: approval.status,
      locationId,
      assignedUserId,
      customerId: approval.customerId,
      customerName: approval.customer?.name || null,
      jobId,
      jobRef,
      label: `${approval.entityType} approval`,
      payloadJson: {
        approvalEntityType: approval.entityType,
        approvalEntityId: approval.entityId,
      },
    };
  }

  private async logActivityEvent(tenantId: string, type: string, label: string, payloadJson: Record<string, any>, snapshot?: EntitySnapshot | null) {
    await this.activity.push({
      tenantId,
      type,
      label,
      customerId: snapshot?.customerId || null,
      customerName: snapshot?.customerName || null,
      jobId: snapshot?.jobId || null,
      jobRef: snapshot?.jobRef || null,
      status: snapshot?.status || null,
      technicianId: snapshot?.assignedUserId || null,
      payloadJson,
    });
  }

  private async createExceptionIfMissing(params: {
    tenantId: string;
    createdBy?: string | null;
    snapshot: EntitySnapshot;
    kind: string;
    severity: string;
    summary: string;
    detailsJson?: Record<string, any> | null;
  }) {
    const existing = await this.db.complianceException.findFirst({
      where: {
        tenantId: params.tenantId,
        entityType: params.snapshot.entityType,
        entityId: params.snapshot.entityId,
        kind: params.kind,
        status: "OPEN",
      },
    });
    if (existing) {
      return this.db.complianceException.update({
        where: { id: existing.id },
        data: {
          severity: this.toExceptionSeverity(params.severity),
          summary: params.summary,
          detailsJson: params.detailsJson ?? null,
          locationId: params.snapshot.locationId || null,
          assignedUserId: params.snapshot.assignedUserId || null,
        },
      });
    }
    const created = await this.db.complianceException.create({
      data: {
        tenantId: params.tenantId,
        entityType: params.snapshot.entityType,
        entityId: params.snapshot.entityId,
        locationId: params.snapshot.locationId || null,
        assignedUserId: params.snapshot.assignedUserId || null,
        kind: params.kind,
        severity: this.toExceptionSeverity(params.severity),
        summary: params.summary,
        detailsJson: params.detailsJson ?? null,
        createdBy: params.createdBy || null,
      },
    });
    await this.logActivityEvent(
      params.tenantId,
      "compliance.exception_created",
      params.summary,
      {
        complianceExceptionId: created.id,
        kind: created.kind,
        entityType: created.entityType,
        entityId: created.entityId,
      },
      params.snapshot,
    );
    await this.automations.evaluateRuleTrigger(params.tenantId, "compliance.exception_created" as any, {
      complianceExceptionId: created.id,
      entityType: created.entityType,
      entityId: created.entityId,
      kind: created.kind,
      severity: created.severity,
      summary: created.summary,
      jobId: params.snapshot.jobId || null,
      jobRef: params.snapshot.jobRef || null,
      customerId: params.snapshot.customerId || null,
      customerName: params.snapshot.customerName || null,
      assignedUserId: params.snapshot.assignedUserId || null,
      status: params.snapshot.status || null,
    });
    return created;
  }

  private async resolveMatchingException(tenantId: string, entityType: string, entityId: string, kind: string) {
    await this.db.complianceException.updateMany({
      where: {
        tenantId,
        entityType,
        entityId,
        kind,
        status: "OPEN",
      },
      data: {
        status: "RESOLVED",
        resolvedAt: this.now(),
        resolvedBy: null,
      },
    });
  }

  private async evaluateOpenCoverageForPolicy(policy: any) {
    const candidateWhere =
      policy.entityType === "JOB"
        ? { companyId: policy.tenantId, status: policy.triggerStatus }
        : policy.entityType === "BOOKING"
          ? { companyId: policy.tenantId, status: policy.triggerStatus }
          : policy.entityType === "QUOTE"
            ? { tenantId: policy.tenantId, status: policy.triggerStatus }
            : policy.entityType === "SERVICE_PLAN"
              ? { tenantId: policy.tenantId, status: policy.triggerStatus }
              : { tenantId: policy.tenantId, status: policy.triggerStatus };

    const rows =
      policy.entityType === "JOB"
        ? await this.db.job.findMany({ where: candidateWhere, select: { id: true } })
        : policy.entityType === "BOOKING"
          ? await this.db.booking.findMany({ where: candidateWhere, select: { id: true } })
          : policy.entityType === "QUOTE"
            ? await this.db.quote.findMany({ where: candidateWhere, select: { id: true } })
            : policy.entityType === "SERVICE_PLAN"
              ? await this.db.servicePlan.findMany({ where: candidateWhere, select: { id: true } })
              : await this.db.customerApproval.findMany({ where: candidateWhere, select: { id: true } });

    for (const row of rows) {
      const snapshot = await this.buildEntitySnapshot(policy.tenantId, policy.entityType, row.id);
      if (!snapshot || this.normalizeStatus(snapshot.status) !== this.normalizeStatus(policy.triggerStatus)) continue;
      const existing = await this.db.workflowSlaEvent.findFirst({
        where: {
          tenantId: policy.tenantId,
          policyId: policy.id,
          entityType: policy.entityType,
          entityId: row.id,
        },
      });
      if (existing) continue;
      await this.db.workflowSlaEvent.create({
        data: {
          tenantId: policy.tenantId,
          policyId: policy.id,
          entityType: policy.entityType,
          entityId: row.id,
          locationId: snapshot.locationId || null,
          assignedUserId: snapshot.assignedUserId || null,
          startedAt: this.now(),
          dueAt: new Date(Date.now() + Number(policy.targetMinutes || 0) * 60 * 1000),
          contextJson: {
            triggerStatus: policy.triggerStatus,
            targetStatus: policy.targetStatus,
            label: snapshot.label || null,
            href: this.toHref(snapshot.entityType, snapshot.entityId),
          },
        },
      });
    }
  }

  async evaluateSlaTransition(params: {
    tenantId: string;
    actorUserId?: string | null;
    entityType: EntitySnapshot["entityType"];
    entityId: string;
    previousStatus?: string | null;
    currentStatus: string;
    locationId?: string | null;
    assignedUserId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    jobId?: string | null;
    jobRef?: string | null;
    label?: string | null;
    payloadJson?: Record<string, any> | null;
  }) {
    const currentStatus = this.normalizeStatus(params.currentStatus);
    const previousStatus = this.normalizeStatus(params.previousStatus);
    const policies = await this.db.workflowSlaPolicy.findMany({
      where: { tenantId: params.tenantId, entityType: params.entityType, active: true },
    });
    const terminalStatuses = new Set(["CANCELLED", "DECLINED", "EXPIRED"]);

    for (const policy of policies) {
      const existing = await this.db.workflowSlaEvent.findFirst({
        where: {
          tenantId: params.tenantId,
          policyId: policy.id,
          entityType: params.entityType,
          entityId: params.entityId,
          status: { in: ["OPEN", "BREACHED"] },
        },
      });

      if (currentStatus === this.normalizeStatus(policy.targetStatus) && existing) {
        await this.db.workflowSlaEvent.update({
          where: { id: existing.id },
          data: {
            status: existing.status === "BREACHED" ? "BREACHED" : "MET",
            completedAt: this.now(),
            locationId: params.locationId || existing.locationId || null,
            assignedUserId: params.assignedUserId || existing.assignedUserId || null,
            contextJson: {
              ...(existing.contextJson || {}),
              completedFromStatus: currentStatus,
              href: this.toHref(params.entityType, params.entityId),
            },
          },
        });
        continue;
      }

      if (terminalStatuses.has(currentStatus) && existing) {
        await this.db.workflowSlaEvent.update({
          where: { id: existing.id },
          data: {
            status: "CANCELLED",
            contextJson: {
              ...(existing.contextJson || {}),
              cancelledFromStatus: currentStatus,
            },
          },
        });
        continue;
      }

      if (currentStatus !== this.normalizeStatus(policy.triggerStatus) || previousStatus === currentStatus || existing) {
        continue;
      }

      await this.db.workflowSlaEvent.create({
        data: {
          tenantId: params.tenantId,
          policyId: policy.id,
          entityType: params.entityType,
          entityId: params.entityId,
          locationId: params.locationId || null,
          assignedUserId: params.assignedUserId || null,
          startedAt: this.now(),
          dueAt: new Date(Date.now() + Number(policy.targetMinutes || 0) * 60 * 1000),
          contextJson: {
            triggerStatus: policy.triggerStatus,
            targetStatus: policy.targetStatus,
            customerId: params.customerId || null,
            customerName: params.customerName || null,
            jobId: params.jobId || null,
            jobRef: params.jobRef || null,
            label: params.label || null,
            href: this.toHref(params.entityType, params.entityId),
            ...(params.payloadJson || {}),
          },
        },
      });
    }
  }

  async syncSlaForEntity(tenantId: string, entityType: EntitySnapshot["entityType"], entityId: string) {
    const snapshot = await this.buildEntitySnapshot(tenantId, entityType, entityId);
    if (!snapshot) return null;
    await this.evaluateSlaTransition({
      tenantId,
      entityType,
      entityId,
      currentStatus: snapshot.status,
      locationId: snapshot.locationId,
      assignedUserId: snapshot.assignedUserId,
      customerId: snapshot.customerId,
      customerName: snapshot.customerName,
      jobId: snapshot.jobId,
      jobRef: snapshot.jobRef,
      label: snapshot.label,
      payloadJson: snapshot.payloadJson,
    });
    if (entityType === "JOB") {
      await this.syncJobRequiredFieldException(tenantId, entityId);
      await this.syncMissingExecutionEvidenceException(tenantId, entityId);
    }
    if (entityType === "QUOTE") {
      await this.syncQuoteApprovalException(tenantId, entityId);
    }
    return snapshot;
  }

  async syncTenantState(tenantId: string) {
    const policies = await this.db.workflowSlaPolicy.findMany({
      where: { tenantId, active: true },
    });
    for (const policy of policies) {
      await this.evaluateOpenCoverageForPolicy(policy);
    }
    await this.refreshBreachedEvents(tenantId);
    await this.syncExecutionAcknowledgementExceptions(tenantId);
    await this.syncInvoicePressureExceptions(tenantId);
    await this.syncRequiredFieldExceptions(tenantId);
    await this.syncMissingExecutionEvidenceExceptions(tenantId);
    await this.syncQuoteApprovalLagExceptions(tenantId);
  }

  private async refreshBreachedEvents(tenantId: string) {
    const rows = await this.db.workflowSlaEvent.findMany({
      where: {
        tenantId,
        status: "OPEN",
        dueAt: { lt: this.now() },
      },
      include: { policy: true },
    });
    for (const row of rows) {
      const snapshot = await this.buildEntitySnapshot(tenantId, row.entityType, row.entityId);
      const breached = await this.db.workflowSlaEvent.update({
        where: { id: row.id },
        data: {
          status: "BREACHED",
          breachedAt: this.now(),
        },
      });
      await this.logActivityEvent(
        tenantId,
        "sla.breached",
        `${row.policy?.name || "Workflow SLA"} breached`,
        {
          workflowSlaEventId: breached.id,
          policyId: row.policyId,
          entityType: row.entityType,
          entityId: row.entityId,
        },
        snapshot,
      );
      await this.automations.evaluateRuleTrigger(tenantId, "sla.breached" as any, {
        workflowSlaEventId: breached.id,
        policyId: row.policyId,
        entityType: row.entityType,
        entityId: row.entityId,
        severity: row.policy?.severity || "WARNING",
        dueAt: row.dueAt,
        breachedAt: breached.breachedAt,
        jobId: snapshot?.jobId || null,
        jobRef: snapshot?.jobRef || null,
        customerId: snapshot?.customerId || null,
        customerName: snapshot?.customerName || null,
        assignedUserId: snapshot?.assignedUserId || null,
        status: snapshot?.status || null,
      });
      if (snapshot) {
        await this.createExceptionIfMissing({
          tenantId,
          snapshot,
          kind: "SLA_BREACH",
          severity: row.policy?.severity || "WARNING",
          summary: `${row.policy?.name || "Workflow SLA"} breached`,
          detailsJson: {
            workflowSlaEventId: breached.id,
            policyId: row.policyId,
            dueAt: row.dueAt,
            breachedAt: breached.breachedAt,
            targetStatus: row.policy?.targetStatus || null,
          },
        });
      }
    }
  }

  private async syncJobRequiredFieldException(tenantId: string, jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: { id: true, status: true, locationId: true, assignedUserId: true, customerId: true, customerName: true, jobRef: true },
    });
    if (!job) return;
    const settings = await this.db.tenantSetting.findUnique({
      where: { tenantId },
      select: { businessConfigJson: true },
    });
    const readiness = await resolveWorkflowStageReadiness({
      prisma: this.prisma,
      tenantId,
      entityType: "job",
      entityId: job.id,
      status: job.status,
      settings,
    });
    if (readiness.ready || !readiness.missingRequiredFields?.length) {
      await this.resolveMatchingException(tenantId, "JOB", job.id, "MISSING_REQUIRED_FIELD");
      return;
    }
    await this.createExceptionIfMissing({
      tenantId,
      snapshot: {
        entityType: "JOB",
        entityId: job.id,
        status: job.status,
        locationId: job.locationId,
        assignedUserId: job.assignedUserId,
        customerId: job.customerId,
        customerName: job.customerName,
        jobId: job.id,
        jobRef: job.jobRef,
        label: job.jobRef,
      },
      kind: "MISSING_REQUIRED_FIELD",
      severity: "WARNING",
      summary: `${job.jobRef || job.id} is blocked by missing required workflow fields`,
      detailsJson: {
        workflowStageId: readiness.stageId,
        workflowStageLabel: readiness.stageLabel,
        missingRequiredFields: readiness.missingRequiredFields,
      },
    });
  }

  private async syncRequiredFieldExceptions(tenantId: string) {
    const jobs = await this.db.job.findMany({
      where: { companyId: tenantId, status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] } },
      select: { id: true },
      take: 200,
    });
    for (const job of jobs) {
      await this.syncJobRequiredFieldException(tenantId, job.id);
    }
  }

  private async syncMissingExecutionEvidenceException(tenantId: string, jobId: string) {
    const settings = await this.db.tenantSetting.findUnique({
      where: { tenantId },
      select: { businessConfigJson: true },
    });
    const requireEvidence = Boolean((settings?.businessConfigJson as any)?.compliance?.requireExecutionEvidenceForCompletedJobs);
    if (!requireEvidence) {
      await this.resolveMatchingException(tenantId, "JOB", jobId, "MISSING_EXECUTION_EVIDENCE");
      return;
    }
    const job = await this.db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: {
        id: true,
        status: true,
        locationId: true,
        assignedUserId: true,
        customerId: true,
        customerName: true,
        jobRef: true,
        _count: { select: { executionEvidence: true } },
      },
    });
    if (!job || !["COMPLETED", "INVOICED"].includes(job.status) || Number(job._count?.executionEvidence || 0) > 0) {
      await this.resolveMatchingException(tenantId, "JOB", jobId, "MISSING_EXECUTION_EVIDENCE");
      return;
    }
    await this.createExceptionIfMissing({
      tenantId,
      snapshot: {
        entityType: "JOB",
        entityId: job.id,
        status: job.status,
        locationId: job.locationId,
        assignedUserId: job.assignedUserId,
        customerId: job.customerId,
        customerName: job.customerName,
        jobId: job.id,
        jobRef: job.jobRef,
        label: job.jobRef,
      },
      kind: "MISSING_EXECUTION_EVIDENCE",
      severity: "CRITICAL",
      summary: `${job.jobRef || job.id} completed without execution evidence`,
      detailsJson: {
        requiredByConfig: true,
      },
    });
  }

  private async syncMissingExecutionEvidenceExceptions(tenantId: string) {
    const jobs = await this.db.job.findMany({
      where: { companyId: tenantId, status: { in: ["COMPLETED", "INVOICED"] } },
      select: { id: true },
      take: 200,
    });
    for (const job of jobs) {
      await this.syncMissingExecutionEvidenceException(tenantId, job.id);
    }
  }

  private async syncExecutionAcknowledgementExceptions(tenantId: string) {
    const settings = await this.db.tenantSetting.findUnique({
      where: { tenantId },
      select: { businessConfigJson: true },
    });
    const thresholdHours = Math.max(1, Number((settings?.businessConfigJson as any)?.compliance?.executionAcknowledgementThresholdHours || 24));
    const thresholdAt = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const rows = await this.db.jobExecutionRecord.findMany({
      where: {
        tenantId,
        status: "SUBMITTED",
        acknowledgedAt: null,
      },
      include: {
        job: {
          select: {
            id: true,
            status: true,
            locationId: true,
            assignedUserId: true,
            customerId: true,
            customerName: true,
            jobRef: true,
          },
        },
      },
    });
    for (const row of rows) {
      const overdue = row.submittedAt && new Date(row.submittedAt).getTime() <= thresholdAt.getTime();
      if (!row.job || !overdue) {
        await this.resolveMatchingException(tenantId, "JOB", row.jobId, "MISSING_APPROVAL");
        continue;
      }
      await this.createExceptionIfMissing({
        tenantId,
        snapshot: {
          entityType: "JOB",
          entityId: row.job.id,
          status: row.job.status,
          locationId: row.job.locationId,
          assignedUserId: row.job.assignedUserId,
          customerId: row.job.customerId,
          customerName: row.job.customerName,
          jobId: row.job.id,
          jobRef: row.job.jobRef,
          label: row.job.jobRef,
        },
        kind: "MISSING_APPROVAL",
        severity: "WARNING",
        summary: `${row.job.jobRef || row.job.id} completion is still awaiting acknowledgement`,
        detailsJson: {
          executionRecordId: row.id,
          submittedAt: row.submittedAt,
          thresholdHours,
        },
      });
    }
  }

  private async syncInvoicePressureExceptions(tenantId: string) {
    const jobs = await this.db.job.findMany({
      where: {
        companyId: tenantId,
        invoiceIssuedAt: { not: null },
        invoicePaidAt: null,
      },
      select: {
        id: true,
        status: true,
        locationId: true,
        assignedUserId: true,
        customerId: true,
        customerName: true,
        jobRef: true,
        invoiceDueAt: true,
      },
    });
    for (const job of jobs) {
      const overdue = job.invoiceDueAt && new Date(job.invoiceDueAt).getTime() < Date.now();
      if (!overdue) {
        await this.resolveMatchingException(tenantId, "JOB", job.id, "SLA_BREACH");
        continue;
      }
      await this.createExceptionIfMissing({
        tenantId,
        snapshot: {
          entityType: "JOB",
          entityId: job.id,
          status: job.status,
          locationId: job.locationId,
          assignedUserId: job.assignedUserId,
          customerId: job.customerId,
          customerName: job.customerName,
          jobId: job.id,
          jobRef: job.jobRef,
          label: job.jobRef,
        },
        kind: "SLA_BREACH",
        severity: "CRITICAL",
        summary: `${job.jobRef || job.id} invoice is overdue`,
        detailsJson: {
          invoiceDueAt: job.invoiceDueAt,
          source: "collections",
        },
      });
    }
  }

  private async syncQuoteApprovalException(tenantId: string, quoteId: string) {
    const quote = await this.db.quote.findFirst({
      where: { id: quoteId, tenantId },
      select: {
        id: true,
        status: true,
        customerId: true,
        customer: { select: { name: true } },
        quoteNumber: true,
        job: { select: { id: true, jobRef: true, locationId: true, assignedUserId: true } },
      },
    });
    if (!quote) return;
    const openBreached = await this.db.workflowSlaEvent.findFirst({
      where: {
        tenantId,
        entityType: "QUOTE",
        entityId: quote.id,
        status: "BREACHED",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!openBreached) {
      await this.resolveMatchingException(tenantId, "QUOTE", quote.id, "SLA_BREACH");
      return;
    }
    await this.createExceptionIfMissing({
      tenantId,
      snapshot: {
        entityType: "QUOTE",
        entityId: quote.id,
        status: quote.status,
        locationId: quote.job?.locationId || null,
        assignedUserId: quote.job?.assignedUserId || null,
        customerId: quote.customerId,
        customerName: quote.customer?.name || null,
        jobId: quote.job?.id || null,
        jobRef: quote.job?.jobRef || null,
        label: quote.quoteNumber,
      },
      kind: "SLA_BREACH",
      severity: "WARNING",
      summary: `${quote.quoteNumber} is still waiting for approval beyond SLA`,
      detailsJson: {
        workflowSlaEventId: openBreached.id,
      },
    });
  }

  private async syncQuoteApprovalLagExceptions(tenantId: string) {
    const rows = await this.db.quote.findMany({
      where: { tenantId, status: "SENT" },
      select: { id: true },
      take: 100,
    });
    for (const row of rows) {
      await this.syncQuoteApprovalException(tenantId, row.id);
    }
  }

  async listPolicies(tenantId: string) {
    return this.db.workflowSlaPolicy.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  async createPolicy(tenantId: string, userId: string, dto: UpsertWorkflowSlaPolicyDto) {
    const created = await this.db.workflowSlaPolicy.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        entityType: this.normalizeEntityType(dto.entityType),
        triggerStatus: this.normalizeStatus(dto.triggerStatus),
        targetStatus: this.normalizeStatus(dto.targetStatus),
        targetMinutes: Number(dto.targetMinutes),
        severity: dto.severity || "WARNING",
        active: dto.active ?? true,
        metadataJson: dto.metadataJson ?? null,
      },
    });
    await this.audit.log(tenantId, "compliance.sla_policy.create", `Created SLA policy ${created.name}`, userId);
    await this.logActivityEvent(tenantId, "compliance.policy_created", `Created SLA policy ${created.name}`, {
      workflowSlaPolicyId: created.id,
      entityType: created.entityType,
    });
    return created;
  }

  async updatePolicy(tenantId: string, userId: string, id: string, dto: UpsertWorkflowSlaPolicyDto) {
    const existing = await this.db.workflowSlaPolicy.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("SLA policy not found");
    const updated = await this.db.workflowSlaPolicy.update({
      where: { id },
      data: {
        name: dto.name?.trim() || existing.name,
        entityType: dto.entityType ? this.normalizeEntityType(dto.entityType) : existing.entityType,
        triggerStatus: dto.triggerStatus ? this.normalizeStatus(dto.triggerStatus) : existing.triggerStatus,
        targetStatus: dto.targetStatus ? this.normalizeStatus(dto.targetStatus) : existing.targetStatus,
        targetMinutes: dto.targetMinutes ?? existing.targetMinutes,
        severity: dto.severity || existing.severity,
        active: dto.active ?? existing.active,
        metadataJson: dto.metadataJson !== undefined ? dto.metadataJson ?? null : existing.metadataJson,
      },
    });
    await this.audit.log(tenantId, "compliance.sla_policy.update", `Updated SLA policy ${updated.name}`, userId);
    return updated;
  }

  async listEvents(tenantId: string, filters: ListWorkflowSlaEventsDto) {
    await this.syncTenantState(tenantId);
    const rows = await this.db.workflowSlaEvent.findMany({
      where: {
        tenantId,
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.locationId && filters.locationId !== "all" ? { locationId: filters.locationId } : {}),
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters.policyId ? { policyId: filters.policyId } : {}),
        ...(filters.severity ? { policy: { severity: filters.severity } } : {}),
      },
      include: {
        policy: true,
        location: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, email: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map((row: any) => ({
      id: row.id,
      policyId: row.policyId,
      policyName: row.policy?.name || null,
      severity: row.policy?.severity || null,
      entityType: row.entityType,
      entityId: row.entityId,
      startedAt: row.startedAt,
      dueAt: row.dueAt,
      completedAt: row.completedAt || null,
      breachedAt: row.breachedAt || null,
      status: row.status,
      contextJson: row.contextJson || null,
      locationId: row.locationId || null,
      locationName: row.location?.name || null,
      assignedUserId: row.assignedUserId || null,
      assignedUserEmail: row.assignedUser?.email || null,
      href: this.toHref(row.entityType, row.entityId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listComplianceExceptions(tenantId: string, filters: ListComplianceExceptionsDto) {
    await this.syncTenantState(tenantId);
    if (filters.entityType && filters.entityId) {
      await this.syncSlaForEntity(tenantId, this.normalizeEntityType(filters.entityType), filters.entityId);
    }
    const rows = await this.db.complianceException.findMany({
      where: {
        tenantId,
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.locationId && filters.locationId !== "all" ? { locationId: filters.locationId } : {}),
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, email: true } },
        createdByUser: { select: { id: true, email: true } },
        resolvedByUser: { select: { id: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map((row: any) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      kind: row.kind,
      severity: row.severity,
      status: row.status,
      summary: row.summary,
      detailsJson: row.detailsJson || null,
      locationId: row.locationId || null,
      locationName: row.location?.name || null,
      assignedUserId: row.assignedUserId || null,
      assignedUserEmail: row.assignedUser?.email || null,
      createdBy: row.createdBy || null,
      createdByEmail: row.createdByUser?.email || null,
      resolvedBy: row.resolvedBy || null,
      resolvedByEmail: row.resolvedByUser?.email || null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt || null,
      updatedAt: row.updatedAt,
      href: this.toHref(row.entityType, row.entityId),
    }));
  }

  async resolveComplianceException(tenantId: string, userId: string, id: string, note?: string | null) {
    const existing = await this.db.complianceException.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Compliance exception not found");
    const updated = await this.db.complianceException.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: this.now(),
        resolvedBy: userId,
        detailsJson: {
          ...(existing.detailsJson || {}),
          resolutionNote: String(note || "").trim() || null,
        },
      },
    });
    await this.audit.log(tenantId, "compliance.exception.resolve", `Resolved compliance exception ${updated.id}`, userId);
    await this.logActivityEvent(tenantId, "compliance.exception_resolved", updated.summary, {
      complianceExceptionId: updated.id,
      entityType: updated.entityType,
      entityId: updated.entityId,
    });
    return updated;
  }

  async dismissComplianceException(tenantId: string, userId: string, id: string, note?: string | null) {
    const existing = await this.db.complianceException.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Compliance exception not found");
    const updated = await this.db.complianceException.update({
      where: { id },
      data: {
        status: "DISMISSED",
        resolvedAt: this.now(),
        resolvedBy: userId,
        detailsJson: {
          ...(existing.detailsJson || {}),
          dismissalNote: String(note || "").trim() || null,
        },
      },
    });
    await this.audit.log(tenantId, "compliance.exception.dismiss", `Dismissed compliance exception ${updated.id}`, userId);
    return updated;
  }

  async getSummary(tenantId: string, locationId?: string) {
    await this.syncTenantState(tenantId);
    const locationWhere = locationId && locationId !== "all" ? { locationId } : {};
    const [policyCount, activePolicyCount, openEvents, breachedEvents, openExceptions, criticalOpenExceptions] = await Promise.all([
      this.db.workflowSlaPolicy.count({ where: { tenantId } }),
      this.db.workflowSlaPolicy.count({ where: { tenantId, active: true } }),
      this.db.workflowSlaEvent.count({ where: { tenantId, status: "OPEN", ...locationWhere } }),
      this.db.workflowSlaEvent.count({ where: { tenantId, status: "BREACHED", ...locationWhere } }),
      this.db.complianceException.count({ where: { tenantId, status: "OPEN", ...locationWhere } }),
      this.db.complianceException.count({ where: { tenantId, status: "OPEN", severity: "CRITICAL", ...locationWhere } }),
    ]);
    const pressure = await this.listComplianceExceptions(tenantId, { status: "OPEN", locationId, severity: "CRITICAL" } as any);
    return {
      totals: {
        policies: policyCount,
        activePolicies: activePolicyCount,
        openEvents,
        breachedEvents,
        openExceptions,
        criticalOpenExceptions,
      },
      pressure: pressure.slice(0, 5),
    };
  }
}
